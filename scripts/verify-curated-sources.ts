import { strict as assert } from 'node:assert'
import {
  configuredArxivQueries,
  configuredHogFeeds,
  configuredWebSources,
} from '@/scripts/ingest-brain'

const snapshot = { ...process.env }

try {
  delete process.env.LABBRAIN_ARXIV_QUERY
  delete process.env.LABBRAIN_ARXIV_QUERIES
  delete process.env.LABBRAIN_HOG_FEEDS
  delete process.env.LABBRAIN_WEB_SOURCES

  const defaultQueries = configuredArxivQueries()
  assert(defaultQueries.some((query) => query.includes('q-bio.NC')), 'default arXiv queries should include computational neuroscience')
  assert(defaultQueries.some((query) => query.includes('cs.CV')), 'default arXiv queries should include computer vision')
  assert(defaultQueries.some((query) => query.includes('cs.LG')), 'default arXiv queries should include machine learning')

  assert.deepEqual(configuredHogFeeds(), ['top', 'new', 'best'])
  assert(configuredWebSources().length >= 3, 'default web sources should include curated neuroscience/lab sources')

  process.env.LABBRAIN_ARXIV_QUERIES = 'cat:q-bio.NC;cat:cs.CV'
  assert.deepEqual(configuredArxivQueries(), ['cat:q-bio.NC', 'cat:cs.CV'])

  delete process.env.LABBRAIN_ARXIV_QUERIES
  process.env.LABBRAIN_ARXIV_QUERY = 'cat:cs.LG'
  assert(configuredArxivQueries().some((query) => query.includes('q-bio.NC')), 'legacy broad cs.LG should fall back to curated research queries')

  process.env.LABBRAIN_ARXIV_QUERY = 'cat:stat.ML'
  assert.deepEqual(configuredArxivQueries(), ['cat:stat.ML'])

  process.env.LABBRAIN_HOG_FEEDS = 'top,new'
  assert.deepEqual(configuredHogFeeds(), ['top', 'new'])

  process.env.LABBRAIN_WEB_SOURCES = 'https://example.com/a,https://example.com/b'
  assert.deepEqual(configuredWebSources(), ['https://example.com/a', 'https://example.com/b'])
} finally {
  process.env = snapshot
}

console.log('Curated source verification passed')
