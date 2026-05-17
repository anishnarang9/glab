import { embed } from '@/lib/embeddings'

export type Embedder = (text: string) => Promise<number[]>

export async function embeddingOrNull(input: {
  content: string
  existing?: number[] | null
  embedder?: Embedder
}): Promise<number[] | null> {
  if (input.existing) return validateEmbedding(input.existing)
  if (process.env.GBRAIN_AUTO_EMBED_ENABLED === 'false') return null

  const embedder = input.embedder ?? (process.env.VOYAGE_API_KEY ? embed : null)
  if (!embedder) return null

  const embedding = await embedder(input.content)
  return validateEmbedding(embedding)
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
