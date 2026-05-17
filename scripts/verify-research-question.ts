import { strict as assert } from 'node:assert'
import { readFile } from 'node:fs/promises'
import { buildResearchQuestion, evidenceHasEmbedding } from '@/lib/research-question'

assert.equal(
  buildResearchQuestion({
    source_kind: 'arxiv_query',
    title: 'Foundation model of neural activity predicts fMRI responses',
    content: 'unused',
  }),
  "How does Foundation model of neural activity predicts fMRI responses change or challenge the lab's current research direction?",
)

assert.equal(
  buildResearchQuestion({
    source_kind: 'hog_news',
    title: 'New open source agent benchmark',
    content: 'unused',
  }),
  "Is New open source agent benchmark relevant enough to affect the lab's research roadmap, or should OpenClaw treat it as background signal?",
)

assert.equal(evidenceHasEmbedding({ embedding: [0.1, 0.2] }), true)
assert.equal(evidenceHasEmbedding({ embedding: null }), false)

const route = await readFile('app/api/brain/research-question/route.ts', 'utf8')
assert(route.includes("source_kind', RESEARCH_SOURCE_KINDS"), 'route should filter to research source evidence')
assert(route.includes('embedding_present'), 'route should expose whether the pulled evidence was embedded')

console.log('Research question verification passed')
