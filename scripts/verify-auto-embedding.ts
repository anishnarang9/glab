import { strict as assert } from 'node:assert'
import {
  embeddingsOrNull,
  embeddingOrNull,
  formatPgVectorLiteral,
  normalizeEmbedding,
  type BatchEmbedder,
  type Embedder,
} from '@/lib/embedding-storage'
import { resolveEvidenceEmbedding } from '@/lib/brain'

const fakeEmbedding = Array.from({ length: 1024 }, (_, index) => index / 1024)
let calls = 0
const fakeEmbedder: Embedder = async (text) => {
  calls += 1
  assert(text.includes('visual cortex'))
  return fakeEmbedding
}

const generated = await embeddingOrNull({
  content: 'visual cortex notes should receive a Voyage embedding',
  embedder: fakeEmbedder,
})

assert.deepEqual(generated, fakeEmbedding)
assert.equal(calls, 1)

const existing = await embeddingOrNull({
  content: 'this should not call the embedder',
  existing: fakeEmbedding,
  embedder: async () => {
    throw new Error('existing embedding should be reused')
  },
})

assert.equal(existing, fakeEmbedding)

const stored = await embeddingOrNull({
  content: 'this should parse stored pgvector literals',
  existing: formatPgVectorLiteral(fakeEmbedding),
  embedder: async () => {
    throw new Error('stored embedding should be reused')
  },
})

assert.deepEqual(stored, fakeEmbedding)

let batchCalls = 0
const fakeBatchEmbedder: BatchEmbedder = async (texts) => {
  batchCalls += 1
  assert.deepEqual(texts, ['visual cortex batch one', 'visual cortex batch two'])
  return [fakeEmbedding, fakeEmbedding]
}

const batch = await embeddingsOrNull({
  contents: ['visual cortex batch one', 'already embedded', 'visual cortex batch two'],
  existing: [null, fakeEmbedding, null],
  batchEmbedder: fakeBatchEmbedder,
})

assert.deepEqual(batch, [fakeEmbedding, fakeEmbedding, fakeEmbedding])
assert.equal(batchCalls, 1)

const evidenceEmbedding = await resolveEvidenceEmbedding({
  content: 'A new arXiv abstract about visual cortex decoding should be embedded before storage.',
  embedding: null,
  embedder: fakeEmbedder,
})

assert.deepEqual(evidenceEmbedding, fakeEmbedding)
assert.equal(formatPgVectorLiteral([0.1, 0.2, 0.3]), '[0.1,0.2,0.3]')
assert.deepEqual(normalizeEmbedding(formatPgVectorLiteral(fakeEmbedding)), fakeEmbedding)

console.log('Auto embedding verification passed')
