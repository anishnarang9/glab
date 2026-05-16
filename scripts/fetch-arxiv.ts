/**
 * fetch-arxiv.ts
 *
 * Fetches recent arXiv papers relevant to THIS lab's research using The Hog
 * web scraper. Searches by each researcher's domain rather than dumping an
 * entire category. Only papers matching lab topics land in the central DB.
 *
 * Flow:
 *   1. Run targeted arXiv searches per lab research area (via Hog scraper)
 *   2. Parse titles + abstracts
 *   3. Score relevance against lab profiles using Anthropic
 *   4. Upsert papers scoring above threshold into Supabase `papers` table
 *
 * Usage: bun fetch-arxiv
 * Env:   HOG_ACCESS_KEY, HOG_SECRET_KEY, ANTHROPIC_API_KEY,
 *        SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'
import type { Database } from '@/db/client'

type PaperInsert = Database['public']['Tables']['papers']['Insert']

const HOG_BASE = 'https://developer.thehog.ai'
const HOG_HEADERS = {
  'X-Access-Key': process.env.HOG_ACCESS_KEY!,
  'X-Secret-Key': process.env.HOG_SECRET_KEY!,
  'Content-Type': 'application/json',
}

// ─── Lab research profile ────────────────────────────────────────────────────
// Each entry generates one targeted arXiv search. Keep specific so results
// are actually relevant — broad category scrapes produce too much noise.

const LAB_SEARCH_QUERIES = [
  // Alice Chen — fMRI decoding, visual representations
  'fMRI decoding visual cortex object recognition CLIP neural representations',
  'cross-subject brain decoding hyperalignment representational similarity',
  // Bob Okafor — connectomics, synaptic structure
  'electron microscopy connectome synaptic connectivity cortex excitatory inhibitory',
  'dense reconstruction neural circuits layer cortex synapse',
  // Clara Mendez — motor BCI, neural prosthetics
  'intracortical brain computer interface motor cortex decoding Utah array',
  'neural population dynamics motor preparation rotational trajectory BCI',
  // David Kim — mean-field theory, criticality, oscillations
  'mean field theory cortical network criticality excitatory inhibitory balance',
  'neural oscillations gamma theta coupling recurrent network dynamics',
]

const LAB_SUMMARY = `
A computational neuroscience lab working on four areas:
1. High-resolution fMRI decoding of visual categories; representational geometry; CLIP alignment with IT cortex.
2. Dense connectome reconstruction in mouse V1 via electron microscopy; E/I synapse ratios; structure-function mapping.
3. Intracortical BCI for motor restoration in spinal cord injury patients; population dynamics; decoder drift.
4. Mean-field theory of cortical networks; criticality; gamma/theta oscillations; E/I balance and dynamic range.
`

// ─── Hog scraper ─────────────────────────────────────────────────────────────

async function hogScrape(url: string): Promise<string> {
  const res = await fetch(`${HOG_BASE}/api/v1/platform/scrapers/web/scrape`, {
    method: 'POST',
    headers: HOG_HEADERS,
    body: JSON.stringify({ url, renderJs: false }),
  })
  if (!res.ok) throw new Error(`Hog scrape error ${res.status}: ${await res.text()}`)
  const data = await res.json()

  const opId = data.operationId ?? data.id
  if (opId) return pollOperation(opId)
  return data.content ?? data.html ?? JSON.stringify(data)
}

async function pollOperation(id: string, maxWaitMs = 30_000): Promise<string> {
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    await sleep(2000)
    const res = await fetch(`${HOG_BASE}/api/operations/${id}`, { headers: HOG_HEADERS })
    if (!res.ok) throw new Error(`Poll ${id} failed: ${res.status}`)
    const data = await res.json()
    if (data.status === 'completed') return data.result?.content ?? data.result?.html ?? ''
    if (data.status === 'failed') throw new Error(`Operation ${id} failed`)
  }
  throw new Error(`Operation ${id} timed out`)
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ─── arXiv parsing ────────────────────────────────────────────────────────────

interface RawPaper {
  arxiv_id: string
  title: string
  abstract: string
  authors: string[]
}

function parseArxivSearchPage(html: string): RawPaper[] {
  const papers: RawPaper[] = []
  // arXiv search results: each result is in <li class="arxiv-result">
  const resultBlocks = [...html.matchAll(/<li class="arxiv-result">([\s\S]*?)<\/li>/g)]

  for (const [, block] of resultBlocks) {
    const idMatch = block.match(/abs\/(\d{4}\.\d{4,5})/)
    if (!idMatch) continue
    const arxiv_id = idMatch[1]

    const titleMatch = block.match(/<p class="title[^"]*">([\s\S]*?)<\/p>/)
    const title = titleMatch ? strip(titleMatch[1]) : ''
    if (!title) continue

    const abstractMatch = block.match(/<span class="abstract-full[^"]*">([\s\S]*?)<\/span>/)
    const abstract = abstractMatch ? strip(abstractMatch[1]).replace(/^Abstract:\s*/i, '') : ''

    const authorMatches = [...block.matchAll(/<a href="\/search[^"]*">([^<]+)<\/a>/g)]
    const authors = authorMatches.map(m => m[1].trim()).filter(Boolean)

    papers.push({ arxiv_id, title, abstract: abstract || title, authors })
  }
  return papers
}

function strip(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

// ─── Relevance scoring ────────────────────────────────────────────────────────

async function scoreRelevance(
  papers: RawPaper[],
  anthropic: Anthropic,
): Promise<Map<string, number>> {
  if (!papers.length) return new Map()

  const list = papers
    .map((p, i) => `[${i}] ${p.title}\nAbstract: ${p.abstract.slice(0, 300)}`)
    .join('\n\n')

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `You are a relevance filter for a neuroscience research lab.

LAB FOCUS:
${LAB_SUMMARY}

Rate each paper 0.0–1.0 for relevance to this lab's work.
Score 0.8+ = highly relevant (directly addresses lab's methods or questions)
Score 0.5–0.79 = somewhat relevant (adjacent topic, useful background)
Score <0.5 = not relevant (different domain, methodology, or species)

PAPERS:
${list}

Respond with ONLY a JSON array of numbers in the same order as the papers.
Example: [0.9, 0.3, 0.7]`,
      },
    ],
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text : '[]'
  const match = text.match(/\[[\d.,\s]+\]/)
  if (!match) return new Map()

  const scores: number[] = JSON.parse(match[0])
  return new Map(papers.map((p, i) => [p.arxiv_id, scores[i] ?? 0]))
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const missing = ['HOG_ACCESS_KEY', 'HOG_SECRET_KEY', 'ANTHROPIC_API_KEY',
    'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter(k => !process.env[k])
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')}`)

  const db = supabaseAdmin()
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const seen = new Set<string>()
  const allPapers: RawPaper[] = []

  // 1. Scrape targeted arXiv searches
  for (const query of LAB_SEARCH_QUERIES) {
    const url = `https://arxiv.org/search/?searchtype=all&query=${encodeURIComponent(query)}&order=-announced_date_first&start=0`
    console.log(`\nSearching: "${query.slice(0, 60)}..."`)

    try {
      const html = await hogScrape(url)
      const papers = parseArxivSearchPage(html)
      console.log(`  Found ${papers.length} results`)

      for (const p of papers) {
        if (!seen.has(p.arxiv_id)) {
          seen.add(p.arxiv_id)
          allPapers.push(p)
        }
      }
    } catch (err) {
      console.error(`  Failed:`, err)
    }
  }

  console.log(`\nTotal unique papers scraped: ${allPapers.length}`)
  if (!allPapers.length) return

  // 2. Score relevance in batches of 10 (Haiku is cheap, keep batches small)
  console.log('\nScoring relevance with Claude Haiku...')
  const scores = new Map<string, number>()
  for (let i = 0; i < allPapers.length; i += 10) {
    const batch = allPapers.slice(i, i + 10)
    const batchScores = await scoreRelevance(batch, anthropic)
    for (const [id, score] of batchScores) scores.set(id, score)
    process.stdout.write('.')
  }
  console.log()

  // 3. Filter to relevant papers (threshold 0.5)
  const THRESHOLD = 0.5
  const relevant = allPapers.filter(p => (scores.get(p.arxiv_id) ?? 0) >= THRESHOLD)
  console.log(`\nRelevant papers (score ≥ ${THRESHOLD}): ${relevant.length} / ${allPapers.length}`)

  for (const p of relevant) {
    console.log(`  [${(scores.get(p.arxiv_id) ?? 0).toFixed(2)}] ${p.title.slice(0, 70)}`)
  }

  if (!relevant.length) {
    console.log('Nothing to upsert.')
    return
  }

  // 4. Upsert into central Supabase papers table
  const rows: PaperInsert[] = relevant.map(p => ({
    arxiv_id: p.arxiv_id,
    title: p.title,
    abstract: p.abstract,
    authors: p.authors,
    published_at: null,
    // embedding populated by match-papers.ts
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db.from('papers') as any).upsert(rows, {
    onConflict: 'arxiv_id',
    ignoreDuplicates: false,
  })

  if (error) {
    console.error('\nSupabase upsert error:', error.message)
  } else {
    console.log(`\nUpserted ${rows.length} papers into central DB.`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
