import { strict as assert } from 'node:assert'
import { readFile } from 'node:fs/promises'
import { buildResearchQuestion, evidenceHasEmbedding, pickBestResearchEvidence, type ResearchQuestionEvidence } from '@/lib/research-question'

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

const newestHog: ResearchQuestionEvidence = {
  id: 'hog',
  source_kind: 'hog_news',
  source_ref: 'hn:1',
  title: 'Newest background technology item',
  content: 'background',
  url: null,
  published_at: null,
  created_at: '2026-05-17T01:15:00.000Z',
  embedding: null,
}
const olderArxiv: ResearchQuestionEvidence = {
  id: 'arxiv',
  source_kind: 'arxiv_query',
  source_ref: '2605.12345',
  title: 'Neural decoding from fMRI responses',
  content: 'paper',
  url: null,
  published_at: null,
  created_at: '2026-05-17T01:05:00.000Z',
  embedding: [0.1],
}

assert.equal(pickBestResearchEvidence([newestHog, olderArxiv])?.id, 'arxiv')

const route = await readFile('app/api/brain/research-question/route.ts', 'utf8')
assert(route.includes('pickBestResearchEvidence'), 'route should prefer research evidence over background feed items')
assert(route.includes('PRIMARY_RESEARCH_SOURCE_KINDS'), 'route should query arXiv/web evidence before HOG background evidence')
assert(route.includes('embedding_present'), 'route should expose whether the pulled evidence was embedded')

console.log('Research question verification passed')
