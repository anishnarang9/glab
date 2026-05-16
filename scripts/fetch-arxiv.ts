/**
 * fetch-arxiv.ts
 *
 * Scrapes recent neuroscience papers from arXiv using The Hog web scraper API,
 * parses title/abstract/authors/arxiv_id, and upserts into the `papers` table.
 *
 * Usage:
 *   bun scripts/fetch-arxiv.ts
 *
 * Env: HOG_ACCESS_KEY, HOG_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
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

// arXiv categories relevant to the neuroscience lab
const ARXIV_CATEGORIES = ['q-bio.NC', 'cs.NE', 'eess.SP']

// ─── Hog helpers ─────────────────────────────────────────────────────────────

async function hogScrape(url: string): Promise<string> {
  const res = await fetch(`${HOG_BASE}/api/v1/platform/scrapers/web/scrape`, {
    method: 'POST',
    headers: HOG_HEADERS,
    body: JSON.stringify({ url, renderJs: false }),
  })
  if (!res.ok) throw new Error(`Hog scrape failed: ${res.status} ${await res.text()}`)
  const data = await res.json()

  // Hog may return an operation ID to poll instead of immediate content
  const opId = data.operationId ?? data.id
  if (opId) return pollOperation(opId)

  return data.content ?? data.html ?? JSON.stringify(data)
}

async function pollOperation(id: string, maxWaitMs = 30_000): Promise<string> {
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    await sleep(2000)
    const res = await fetch(`${HOG_BASE}/api/operations/${id}`, { headers: HOG_HEADERS })
    if (!res.ok) throw new Error(`Poll failed: ${res.status}`)
    const data = await res.json()
    if (data.status === 'completed') {
      return data.result?.content ?? data.result?.html ?? JSON.stringify(data.result)
    }
    if (data.status === 'failed') throw new Error(`Operation failed: ${JSON.stringify(data)}`)
  }
  throw new Error(`Operation ${id} timed out after ${maxWaitMs}ms`)
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ─── arXiv HTML parsing ───────────────────────────────────────────────────────

interface ArxivPaper {
  arxiv_id: string
  title: string
  abstract: string
  authors: string[]
  published_at: string | null
}

function parseArxivListPage(html: string): ArxivPaper[] {
  const papers: ArxivPaper[] = []

  const idPattern = /abs\/(\d{4}\.\d{4,5})/
  const titlePattern = /<div class="list-title[^"]*">[\s\S]*?<span[^>]*>Title:<\/span>\s*([\s\S]*?)<\/div>/
  const authorsPattern = /<div class="list-authors">([\s\S]*?)<\/div>/
  const abstractPattern = /<p class="mathjax">([\s\S]*?)<\/p>/

  const dtBlocks = [...html.matchAll(/<dt>([\s\S]*?)<\/dt>/g)]
  const ddBlocks = [...html.matchAll(/<dt>[\s\S]*?<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)]

  for (let i = 0; i < ddBlocks.length; i++) {
    const dd = ddBlocks[i][1]
    const dt = dtBlocks[i]?.[1] ?? ''

    const idMatch = (dt + dd).match(idPattern)
    if (!idMatch) continue
    const arxiv_id = idMatch[1]

    const titleMatch = dd.match(titlePattern)
    const title = titleMatch ? stripHtml(titleMatch[1]).trim() : ''
    if (!title) continue

    const authorsMatch = dd.match(authorsPattern)
    const authors = authorsMatch
      ? [...authorsMatch[1].matchAll(/>([^<]+)</g)]
          .map(m => m[1].trim())
          .filter(s => s && s !== ',')
      : []

    const abstractMatch = dd.match(abstractPattern)
    const abstract = abstractMatch ? stripHtml(abstractMatch[1]).trim() : ''

    papers.push({ arxiv_id, title, abstract: abstract || title, authors, published_at: null })
  }

  return papers
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.HOG_ACCESS_KEY || !process.env.HOG_SECRET_KEY) {
    throw new Error('HOG_ACCESS_KEY and HOG_SECRET_KEY must be set in .env.local')
  }

  const db = supabaseAdmin()
  let totalUpserted = 0

  for (const cat of ARXIV_CATEGORIES) {
    const url = `https://arxiv.org/list/${cat}/recent`
    console.log(`\nScraping ${url} ...`)

    let html: string
    try {
      html = await hogScrape(url)
    } catch (err) {
      console.error(`  Failed:`, err)
      continue
    }

    const papers = parseArxivListPage(html)
    console.log(`  Parsed ${papers.length} papers`)
    if (!papers.length) continue

    const rows: PaperInsert[] = papers.map(p => ({
      arxiv_id: p.arxiv_id,
      title: p.title,
      abstract: p.abstract,
      authors: p.authors,
      published_at: p.published_at,
      // embedding populated separately by scripts/match-papers.ts
    }))

    // supabase-js upsert type inference breaks under TS6 — cast via any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = db.from('papers') as any
    const { error } = await table.upsert(rows, {
      onConflict: 'arxiv_id',
      ignoreDuplicates: false,
    })

    if (error) {
      console.error(`  Supabase error:`, error.message)
    } else {
      totalUpserted += papers.length
      console.log(`  Upserted ${papers.length}`)
    }
  }

  console.log(`\nDone. Total upserted: ${totalUpserted}`)
}

main().catch(err => { console.error(err); process.exit(1) })
