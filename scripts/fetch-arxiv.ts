/**
 * fetch-arxiv.ts
 *
 * Scrapes publication pages of leading neuroscience labs using The Hog
 * web scraper API. Targets labs relevant to each researcher's domain,
 * extracts paper metadata, and upserts into the central Supabase papers table.
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

// Leading labs per researcher domain
const LAB_PAGES = [
  // Alice — fMRI, visual cortex, neural decoding
  { lab: 'Kanwisher / EvLab (MIT)',     url: 'https://evlab.mit.edu/publications/' },
  { lab: 'DiCarlo Lab (MIT)',            url: 'http://dicarlolab.mit.edu/publications' },
  { lab: 'Huth Lab (UT Austin)',         url: 'https://www.cs.utexas.edu/~huth/publications.html' },
  // Bob — connectomics, electron microscopy
  { lab: 'Seung Lab (Princeton)',        url: 'https://seunglab.org/research/' },
  { lab: 'Lee Lab (Harvard)',            url: 'https://www.leelab.net/publications' },
  // Clara — motor BCI, population dynamics
  { lab: 'Churchland Lab (Columbia)',   url: 'https://churchlandlab.neuroscience.columbia.edu/publications' },
  { lab: 'Shenoy Lab (Stanford)',        url: 'https://shenoylab.stanford.edu/publications' },
  // David — mean-field theory, criticality, oscillations
  { lab: 'Brunel Lab (Duke)',            url: 'https://brunel.neuroscience.duke.edu/publications' },
  { lab: 'Bhatt Lab (Harvard)',          url: 'https://bhatt.hms.harvard.edu/publications' },
]

// ─── Hog scraper ─────────────────────────────────────────────────────────────

async function hogScrape(url: string): Promise<string> {
  const res = await fetch(`${HOG_BASE}/api/v1/platform/scrapers/web/scrape`, {
    method: 'POST',
    headers: HOG_HEADERS,
    body: JSON.stringify({ url, renderJs: true }),
  })
  if (!res.ok) throw new Error(`Hog ${res.status}: ${await res.text()}`)
  const data = await res.json()

  const opId = data.operationId ?? data.id
  if (opId) return pollOperation(opId)
  return data.content ?? data.html ?? data.text ?? JSON.stringify(data)
}

async function pollOperation(id: string, maxWaitMs = 45_000): Promise<string> {
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    await sleep(3000)
    const res = await fetch(`${HOG_BASE}/api/operations/${id}`, { headers: HOG_HEADERS })
    if (!res.ok) throw new Error(`Poll ${id}: ${res.status}`)
    const data = await res.json()
    if (data.status === 'completed') return data.result?.content ?? data.result?.html ?? data.result?.text ?? ''
    if (data.status === 'failed') throw new Error(`Op ${id} failed: ${JSON.stringify(data.error)}`)
  }
  throw new Error(`Op ${id} timed out`)
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ─── Paper extraction ─────────────────────────────────────────────────────────
// Lab websites have wildly different HTML — use heuristics that work broadly:
// 1. Find year headings (2020–2026) and group text beneath them
// 2. Extract paper-shaped text (title-like strings near PDF/DOI links)

interface RawPaper {
  title: string
  authors: string
  year: number | null
  url: string | null
  lab: string
}

function extractPapers(html: string, labName: string): RawPaper[] {
  const papers: RawPaper[] = []

  // Strip tags, collapse whitespace for text-based heuristics
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')

  // Strategy: find PDF/DOI/abstract links and grab surrounding context as title
  const linkPattern = /https?:\/\/\S*(arxiv\.org\/abs|doi\.org|pubmed|pdf)\S*/gi
  const linkMatches = [...html.matchAll(new RegExp(linkPattern.source, 'gi'))]

  const usedOffsets = new Set<number>()

  for (const match of linkMatches) {
    const linkUrl = match[0]
    const offset = match.index ?? 0

    // Extract a ~600 char window around the link from the raw HTML
    const window = html.slice(Math.max(0, offset - 500), offset + 100)
    const windowText = window
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    // Avoid grabbing the same region twice
    const bucket = Math.floor(offset / 300)
    if (usedOffsets.has(bucket)) continue
    usedOffsets.add(bucket)

    // Title heuristic: longest sentence-like segment in the window
    const sentences = windowText.split(/\.\s+/)
    const title = sentences
      .filter(s => s.length > 20 && s.length < 300 && /[A-Z]/.test(s[0] ?? ''))
      .sort((a, b) => b.length - a.length)[0]
      ?.trim()

    if (!title) continue

    // Year — look for 4-digit year in window
    const yearMatch = windowText.match(/\b(20\d{2})\b/)
    const year = yearMatch ? parseInt(yearMatch[1]) : null

    // Authors — text before the title that looks like a name list
    const authorMatch = windowText.match(/([A-Z][a-z]+ [A-Z][a-z]+(?:,\s*[A-Z][a-z]+ [A-Z][a-z]+){1,8})/)
    const authors = authorMatch?.[1] ?? ''

    papers.push({ title, authors, year, url: linkUrl, lab: labName })
  }

  // Dedupe by title similarity
  const seen = new Set<string>()
  return papers.filter(p => {
    const key = p.title.toLowerCase().slice(0, 60)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const missing = ['HOG_ACCESS_KEY', 'HOG_SECRET_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
    .filter(k => !process.env[k])
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')}`)

  const db = supabaseAdmin()
  const allPapers: RawPaper[] = []
  const seenTitles = new Set<string>()

  for (const { lab, url } of LAB_PAGES) {
    console.log(`\nScraping: ${lab}`)
    console.log(`  ${url}`)

    try {
      const html = await hogScrape(url)
      const papers = extractPapers(html, lab)
      console.log(`  Found ${papers.length} papers`)

      for (const p of papers) {
        const key = p.title.toLowerCase().slice(0, 60)
        if (!seenTitles.has(key)) {
          seenTitles.add(key)
          allPapers.push(p)
          console.log(`    [${p.year ?? '?'}] ${p.title.slice(0, 70)}`)
        }
      }
    } catch (err) {
      console.error(`  Failed: ${err instanceof Error ? err.message : err}`)
    }
  }

  console.log(`\nTotal unique papers: ${allPapers.length}`)
  if (!allPapers.length) {
    console.log('Nothing to upsert.')
    return
  }

  // Use title-derived ID since we don't have arxiv IDs for all lab papers
  const rows: PaperInsert[] = allPapers.map(p => ({
    arxiv_id: slugify(p.title),   // stable synthetic ID
    title: p.title,
    abstract: `From ${p.lab}. ${p.authors ? `Authors: ${p.authors}.` : ''}`.trim(),
    authors: p.authors ? p.authors.split(/,\s*/) : [],
    published_at: p.year ? `${p.year}-01-01T00:00:00Z` : null,
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

function slugify(title: string): string {
  return 'lab-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80)
}

main().catch(err => { console.error(err); process.exit(1) })
