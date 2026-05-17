import { createHash } from 'node:crypto'
import { embed, embedBatch } from '@/lib/embeddings'

export type Embedder = (text: string) => Promise<number[]>
export type BatchEmbedder = (texts: string[]) => Promise<number[][]>
export type StoredEmbedding = number[] | string | null | undefined

export async function embeddingOrNull(input: {
  content: string
  existing?: StoredEmbedding
  embedder?: Embedder
  strict?: boolean
}): Promise<number[] | null> {
  const existing = normalizeEmbedding(input.existing)
  if (existing) return existing
  if (process.env.GBRAIN_AUTO_EMBED_ENABLED === 'false') return null

  const embedder = input.embedder ?? (process.env.VOYAGE_API_KEY ? embed : null)
  if (!embedder) return localEmbeddingOrNull(input.content)

  try {
    const embedding = await embedder(input.content)
    return validateEmbedding(embedding)
  } catch (error) {
    if (input.strict) throw error
    warnEmbeddingFailure(error)
    return localEmbeddingOrNull(input.content)
  }
}

export async function embeddingsOrNull(input: {
  contents: string[]
  existing?: StoredEmbedding[]
  batchEmbedder?: BatchEmbedder
  strict?: boolean
}): Promise<Array<number[] | null>> {
  const existing = input.existing ?? []
  const results = input.contents.map((_, index) => normalizeEmbedding(existing[index]))
  if (process.env.GBRAIN_AUTO_EMBED_ENABLED === 'false') return results

  const batchEmbedder = input.batchEmbedder ?? (process.env.VOYAGE_API_KEY ? embedBatch : null)
  if (!batchEmbedder) return fillMissingWithLocalEmbeddings(input.contents, results)

  const missing = input.contents
    .map((content, index) => ({ content, index }))
    .filter((item) => !results[item.index])

  for (const batch of chunkEmbeddingInputs(missing)) {
    try {
      const embeddings = await batchEmbedder(batch.map((item) => item.content))
      if (embeddings.length !== batch.length) {
        throw new Error(`Embedding batch returned ${embeddings.length} results for ${batch.length} inputs`)
      }

      embeddings.forEach((embedding, offset) => {
        results[batch[offset].index] = validateEmbedding(embedding)
      })
    } catch (error) {
      if (input.strict) throw error
      warnEmbeddingFailure(error)
      for (const item of batch) {
        results[item.index] = localEmbeddingOrNull(item.content)
      }
    }
  }

  return results
}

export function normalizeEmbedding(embedding: StoredEmbedding): number[] | null {
  if (!embedding) return null
  if (Array.isArray(embedding)) return validateEmbedding(embedding)

  const trimmed = embedding.trim()
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    throw new Error('Stored embedding is not a pgvector literal')
  }

  const values = trimmed
    .slice(1, -1)
    .split(',')
    .map((value) => Number(value.trim()))

  return validateEmbedding(values)
}

export function validateEmbedding(embedding: number[]): number[] {
  if (embedding.length !== 1024) throw new Error(`Embedding must be 1024 dimensions; received ${embedding.length}`)
  for (const value of embedding) {
    if (!Number.isFinite(value)) throw new Error('Embedding contains a non-finite number')
  }
  return embedding
}

export function formatPgVectorLiteral(embedding: number[]): string {
  return `[${embedding.map((value) => {
    if (!Number.isFinite(value)) throw new Error('Embedding contains a non-finite number')
    return String(value)
  }).join(',')}]`
}

export function localLexicalEmbedding(content: string): number[] {
  const values = Array.from({ length: 1024 }, () => 0)
  const tokens = content.toLowerCase().match(/[a-z0-9]{2,}/g) ?? []

  for (const token of tokens) {
    const digest = createHash('sha256').update(token).digest()
    const index = digest.readUInt16BE(0) % values.length
    const sign = digest[2] % 2 === 0 ? 1 : -1
    values[index] += sign
  }

  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1
  return values.map((value) => value / norm)
}

function localEmbeddingOrNull(content: string): number[] | null {
  if (process.env.GBRAIN_LOCAL_EMBED_FALLBACK_ENABLED === 'false') return null
  return localLexicalEmbedding(content)
}

function fillMissingWithLocalEmbeddings(contents: string[], results: Array<number[] | null>): Array<number[] | null> {
  return results.map((result, index) => result ?? localEmbeddingOrNull(contents[index]))
}

function chunkEmbeddingInputs<T extends { content: string }>(inputs: T[]): T[][] {
  const maxItems = 128
  const maxChars = readIntEnv('GBRAIN_EMBED_BATCH_MAX_CHARS', 28_000, 1_000, 100_000)
  const chunks: T[][] = []
  let current: T[] = []
  let currentChars = 0

  for (const input of inputs) {
    const chars = input.content.length
    if (current.length > 0 && (current.length >= maxItems || currentChars + chars > maxChars)) {
      chunks.push(current)
      current = []
      currentChars = 0
    }

    current.push(input)
    currentChars += chars
  }

  if (current.length > 0) chunks.push(current)
  return chunks
}

function warnEmbeddingFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  console.warn(`GBrain embedding skipped: ${message}`)
}

function readIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name])
  if (!Number.isInteger(raw)) return fallback
  return Math.max(min, Math.min(max, raw))
}
