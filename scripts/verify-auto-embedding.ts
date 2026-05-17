import { strict as assert } from 'node:assert'
import {
  embeddingOrNull,
  formatPgVectorLiteral,
  type Embedder,
} from '@/lib/embedding-storage'

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
assert.equal(formatPgVectorLiteral([0.1, 0.2, 0.3]), '[0.1,0.2,0.3]')

console.log('Auto embedding verification passed')
