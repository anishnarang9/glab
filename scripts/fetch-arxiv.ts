/**
 * fetch-arxiv.ts
 *
 * Runs targeted arXiv searches for each researcher's domain via The Hog
 * web scraper, parses results, dedupes, and upserts into the central
 * Supabase `papers` table.
 *
 * Usage: bun fetch-arxiv
 * Env:   HOG_ACCESS_KEY, HOG_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { supabaseAdmin } from '@/lib/supabase'
import type { Database } from '@/db/client'

type PaperInsert = Database['public']['Tables']['papers']['Insert']

const HOG_BASE = 'https://developer.thehog.ai'
const HOG_HEADERS = {
  'X-Access-Key': process.env.HOG_ACCESS_KEY!,
  'X-Secret-Key': process.env.HOG_SECRET_KEY!,
  'Content-Type': 'application/json',
}

// One search query per researcher domain — results are pre-targeted to the lab.
const LAB_SEARCH_QUERIES = [
  // Alice — fMRI decoding, visual representations
  'fMRI decoding visual cortex object recognition CLIP neural representations',
  'cross-subject brain decoding hyperalignment representational similarity',
  // Bob — connectomics, synaptic structure
  'electron microscopy connectome synaptic connectivity cortex excitatory inhibitory',
  'dense reconstruction neural circuits synapse layer cortex',
  // Clara — motor BCI, neural prosthetics
  'intracortical brain computer interface motor cortex decoding Utah array',
  'neural population dynamics motor preparation rotational trajectory BCI',
  // David — mean-field theory, criticality, oscillations
  'mean field theory cortical network criticality excitatory inhibitory balance',
  'neural oscillations gamma theta coupling recurrent network dynamics',
]

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
  const resultBlocks = [...html.matchAll(/<li class="arxiv-result">([\s\S]*?)<\/li>/g)]

  for (const [, block] of resultBlocks) {
    const idMatch = block.match(/abs\/(\d{4}\.\d{4,5})/)
    if (!idMatch) continue
    const arxiv_id = idMatch[1]

    const titleMatch = block.match(/<p class="title[^"]*">([\s\S]*?)<\/p>/)
    const title = titleMatch ? strip(titleMatch[1]) : ''
    if (!title) continue

    const abstractMatch = block.match(/<span class="abstract-full[^"]*">([\s\S]*?)<\/span>/)
    const abstract = abstractMatch
      ? strip(abstractMatch[1]).replace(/^Abstract:\s*/i, '')
      : ''

    const authorMatches = [...block.matchAll(/<a href="\/search[^"]*">([^<]+)<\/a>/g)]
    const authors = authorMatches.map(m => m[1].trim()).filter(Boolean)

    papers.push({ arxiv_id, title, abstract: abstract || title, authors })
  }
  return papers
}

function strip(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const missing = ['HOG_ACCESS_KEY', 'HOG_SECRET_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
    .filter(k => !process.env[k])
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')}`)

  const db = supabaseAdmin()
  const seen = new Set<string>()
  const papers: RawPaper[] = []

  for (const query of LAB_SEARCH_QUERIES) {
    const url = `https://arxiv.org/search/?searchtype=all&query=${encodeURIComponent(query)}&order=-announced_date_first&start=0`
    console.log(`\nSearching: "${query.slice(0, 70)}"`)

    try {
      const html = await hogScrape(url)
      const results = parseArxivSearchPage(html)
      console.log(`  ${results.length} results`)

      for (const p of results) {
        if (!seen.has(p.arxiv_id)) {
          seen.add(p.arxiv_id)
          papers.push(p)
        }
      }
    } catch (err) {
      console.error(`  Failed:`, err)
    }
  }

  console.log(`\nTotal unique papers: ${papers.length}`)
  if (!papers.length) return

  const rows: PaperInsert[] = papers.map(p => ({
    arxiv_id: p.arxiv_id,
    title: p.title,
    abstract: p.abstract,
    authors: p.authors,
    published_at: null,
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db.from('papers') as any).upsert(rows, {
    onConflict: 'arxiv_id',
    ignoreDuplicates: true,
  })

  if (error) {
    console.error('Supabase upsert error:', error.message)
    process.exit(1)
  }

  console.log(`Upserted ${rows.length} papers into central DB.`)
}

main().catch(err => { console.error(err); process.exit(1) })
