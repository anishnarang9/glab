// Central GBrain ingestion runner. Used by manual runs and Railway cron.

import { fileURLToPath } from 'node:url'
import {
  createBrainCommit,
  createEvidenceItem,
  ensureBrainSource,
  ensureDefaultBrain,
  finishIngestionRun,
  startIngestionRun,
} from '@/lib/brain'
import { supabaseAdmin } from '@/lib/supabase'
import { runOpenClawOnEvidence } from '@/lib/openclaw'
import { runSharedArtifactIngestion } from '@/lib/shared-artifact-ingestion'
import type { Artifact, Brain, BrainSource, IngestionRunTrigger, Json, Paper } from '@/db/client'

type EvidenceSeed = {
  sourceKind: string
  sourceRef?: string | null
  title?: string | null
  content: string
  url?: string | null
  publishedAt?: string | null
  artifactId?: string | null
  paperId?: string | null
}

type ArxivEntry = {
  arxivId: string
  title: string
  abstract: string
  authors: string[]
  url: string
  publishedAt: string | null
}

type HogStory = {
  id: number
  title?: string
  url?: string
  by?: string
  score?: number
  descendants?: number
  time?: number
  text?: string
  type?: string
}

type HogScrapeResult = {
  content?: string
  html?: string
  text?: string
  markdown?: string
  data?: {
    content?: string
    html?: string
    text?: string
    markdown?: string
  }
  operationId?: string
  id?: string
  result?: {
    content?: string
    html?: string
    text?: string
    markdown?: string
  }
  status?: string
}

export async function runCentralGBrainIngestion(trigger: IngestionRunTrigger = parseTrigger()): Promise<number> {
  const brain = await ensureDefaultBrain()
  await ensureConfiguredSources(brain)
  const sources = await enabledSources(brain.id)

  if (sources.length === 0) {
    console.log(`No enabled sources for brain ${brain.name}`)
    return 0
  }

  const sharedArtifacts = await runSharedArtifactIngestion({ trigger })
  if (sharedArtifacts.errors.length > 0) {
    console.error(`Shared artifact ingestion errors: ${sharedArtifacts.errors.join('; ')}`)
  }

  let createdEvidence = sharedArtifacts.ingested
  for (const source of sources.filter((source) => source.kind !== 'researcher_shared_artifacts')) {
    createdEvidence += await ingestSource(brain, source, trigger)
  }

  console.log(`Central GBrain ingestion complete: ${createdEvidence} new evidence items`)
  return createdEvidence
}

async function main(): Promise<void> {
  await runCentralGBrainIngestion()
}

function parseTrigger(): IngestionRunTrigger {
  const argv = (globalThis as unknown as { Bun?: { argv: string[] } }).Bun?.argv.slice(2) ?? []
  const triggerIndex = argv.indexOf('--trigger')
  if (triggerIndex === -1) return 'manual'
  const value = argv[triggerIndex + 1]
  if (
    value === 'morning_cron' ||
    value === 'manual' ||
    value === 'source_refresh' ||
    value === 'openclaw_worker'
  ) return value
  throw new Error(`Invalid --trigger value: ${value}`)
}

async function ensureConfiguredSources(brain: Brain): Promise<void> {
  await ensureBrainSource({
    brainId: brain.id,
    kind: 'researcher_shared_artifacts',
    label: 'Researcher shared artifacts',
    config: {},
    cadence: 'manual',
  })

  const arxivQuery = process.env.LABBRAIN_ARXIV_QUERY
  if (arxivQuery) {
    await ensureBrainSource({
      brainId: brain.id,
      kind: 'arxiv_query',
      label: `arXiv ${arxivQuery}`,
      config: { query: arxivQuery, max_results: 25 },
      cadence: 'daily',
    })
  }

  const rssFeeds = splitEnv(process.env.LABBRAIN_RSS_FEEDS)
  for (const url of rssFeeds) {
    await ensureBrainSource({
      brainId: brain.id,
      kind: 'rss_feed',
      label: url,
      config: { url },
      cadence: 'daily',
    })
  }

  const hogFeeds = splitEnv(process.env.LABBRAIN_HOG_FEEDS)
  for (const feed of hogFeeds.length ? hogFeeds : ['top']) {
    await ensureBrainSource({
      brainId: brain.id,
      kind: 'hog_news',
      label: `HOG Hacker News ${feed}`,
      config: { feed, limit: 30 },
      cadence: 'hourly',
    })
  }
}

async function enabledSources(brainId: string): Promise<BrainSource[]> {
  const client = supabaseAdmin()
  const { data, error } = await client
    .from('brain_sources')
    .select()
    .eq('brain_id', brainId)
    .eq('enabled', true)
    .order('created_at')

  if (error) throw error
  return data
}

async function ingestSource(brain: Brain, source: BrainSource, trigger: IngestionRunTrigger): Promise<number> {
  const run = await startIngestionRun({
    brainId: brain.id,
    sourceId: source.id,
    trigger,
  })

  try {
    const seeds = await evidenceForSource(brain, source)
    let createdCount = 0

    for (const seed of seeds) {
      const { evidence, created } = await createEvidenceItem({
        brainId: brain.id,
        sourceId: source.id,
        ingestionRunId: run.id,
        artifactId: seed.artifactId ?? null,
        paperId: seed.paperId ?? null,
        sourceKind: seed.sourceKind,
        sourceRef: seed.sourceRef ?? null,
        title: seed.title ?? null,
        content: seed.content,
        url: seed.url ?? null,
        publishedAt: seed.publishedAt ?? null,
      })

      if (!created) continue

      createdCount += 1
      await createBrainCommit({
        brainId: brain.id,
        ingestionRunId: run.id,
        kind: 'evidence_added',
        summary: `New ${source.kind} evidence: ${seed.title ?? seed.sourceRef ?? evidence.id}`,
        changes: [
          {
            entityType: 'evidence',
            entityId: evidence.id,
            changeType: 'created',
            after: { source_kind: seed.sourceKind, source_ref: seed.sourceRef ?? null },
          },
        ],
      })
      await runOpenClawOnEvidence({ brain, evidence, ingestionRunId: run.id })
    }

    await markSourceChecked(source.id)
    await finishIngestionRun(run.id, createdCount > 0 ? 'succeeded' : 'skipped')
    console.log(`${source.label}: ${createdCount} new evidence items`)
    return createdCount
  } catch (error) {
    await finishIngestionRun(run.id, 'failed', error instanceof Error ? error.message : String(error))
    throw error
  }
}

async function evidenceForSource(brain: Brain, source: BrainSource): Promise<EvidenceSeed[]> {
  switch (source.kind) {
    case 'researcher_shared_artifacts':
      return sharedArtifactEvidence(brain.id)
    case 'arxiv_query':
      return arxivEvidence(source.config)
    case 'rss_feed':
      return rssEvidence(source.config)
    case 'web_page':
      return webPageEvidence(source.config)
    case 'hog_news':
      return hogNewsEvidence(source.config)
    case 'manual_upload':
      return []
  }
}

async function sharedArtifactEvidence(brainId: string): Promise<EvidenceSeed[]> {
  const client = supabaseAdmin()
  const { data, error } = await client
    .from('artifacts')
    .select()
    .eq('brain_id', brainId)
    .eq('tier', 'shared')
    .order('created_at', { ascending: false })

  if (error) throw error

  return data.map((artifact: Artifact) => ({
    sourceKind: 'researcher_shared_artifacts',
    sourceRef: artifact.id,
    title: artifact.title,
    content: artifact.content,
    artifactId: artifact.id,
  }))
}

async function arxivEvidence(config: Json): Promise<EvidenceSeed[]> {
  const cfg = asObject(config)
  const query = typeof cfg.query === 'string' ? cfg.query : 'cat:cs.LG'
  const maxResults = typeof cfg.max_results === 'number' ? cfg.max_results : 25
  const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&start=0&max_results=${maxResults}&sortBy=submittedDate&sortOrder=descending`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`arXiv fetch failed: ${response.status} ${response.statusText}`)

  const xml = await response.text()
  const entries = parseArxiv(xml)
  const papers = await upsertPapers(entries)

  return papers.map((paper) => ({
    sourceKind: 'arxiv_query',
    sourceRef: paper.arxiv_id,
    title: paper.title,
    content: paper.abstract,
    url: `https://arxiv.org/abs/${paper.arxiv_id}`,
    publishedAt: paper.published_at,
    paperId: paper.id,
  }))
}

async function upsertPapers(entries: ArxivEntry[]): Promise<Paper[]> {
  const client = supabaseAdmin()
  const papers: Paper[] = []
  for (const entry of entries) {
    const { data, error } = await client
      .from('papers')
      .upsert(
        {
          arxiv_id: entry.arxivId,
          title: entry.title,
          abstract: entry.abstract,
          authors: entry.authors,
          published_at: entry.publishedAt,
        },
        { onConflict: 'arxiv_id' },
      )
      .select()
      .single()

    if (error) throw error
    papers.push(data)
  }
  return papers
}

async function rssEvidence(config: Json): Promise<EvidenceSeed[]> {
  const cfg = asObject(config)
  const url = requireConfigString(cfg, 'url')
  const response = await fetch(url)
  if (!response.ok) throw new Error(`RSS fetch failed for ${url}: ${response.status} ${response.statusText}`)
  const xml = await response.text()
  return parseRss(xml, url)
}

async function webPageEvidence(config: Json): Promise<EvidenceSeed[]> {
  const cfg = asObject(config)
  const url = requireConfigString(cfg, 'url')
  const html = await fetchWebText(url)
  return extractBlocks(html).slice(0, 12).map((content, index) => ({
    sourceKind: 'web_page',
    sourceRef: `${url}#block-${index + 1}`,
    title: extractTitle(html) ?? url,
    content,
    url,
  }))
}

async function hogNewsEvidence(config: Json): Promise<EvidenceSeed[]> {
  const cfg = asObject(config)
  const feed = normalizeHogFeed(typeof cfg.feed === 'string' ? cfg.feed : 'top')
  const limit = clampLimit(typeof cfg.limit === 'number' ? cfg.limit : 30, 1, 100)
  if (hasHogCredentials()) return hogScrapedNewsEvidence(feed, limit)

  const idsResponse = await fetch(`https://hacker-news.firebaseio.com/v0/${feed}stories.json`)
  if (!idsResponse.ok) throw new Error(`HOG Hacker News fetch failed: ${idsResponse.status} ${idsResponse.statusText}`)

  const ids = await idsResponse.json() as number[]
  const stories = await Promise.all(ids.slice(0, limit).map(fetchHogStory))

  return stories.filter(isUsefulHogStory).map((story) => ({
    sourceKind: 'hog_news',
    sourceRef: `hn:${story.id}`,
    title: story.title ?? `Hacker News item ${story.id}`,
    content: hogStoryContent(story),
    url: story.url ?? `https://news.ycombinator.com/item?id=${story.id}`,
    publishedAt: story.time ? new Date(story.time * 1000).toISOString() : null,
  }))
}

async function fetchHogStory(id: number): Promise<HogStory> {
  const response = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
  if (!response.ok) throw new Error(`HOG Hacker News item ${id} fetch failed: ${response.status} ${response.statusText}`)
  return await response.json() as HogStory
}

async function hogScrapedNewsEvidence(feed: 'top' | 'new' | 'best', limit: number): Promise<EvidenceSeed[]> {
  const url = feed === 'top' ? 'https://news.ycombinator.com/' : `https://news.ycombinator.com/${feed === 'new' ? 'newest' : feed}`
  const text = await hogScrape(url)
  const stories = parseHackerNewsText(text, limit)
  if (stories.length === 0) return hogFirebaseNewsEvidence(feed, limit)

  return stories.map((story) => ({
    sourceKind: 'hog_news',
    sourceRef: story.sourceRef,
    title: story.title,
    content: [
      `HOG scraped Hacker News ${feed} story: ${story.title}`,
      story.url ? `URL: ${story.url}` : null,
      story.points ? `Points: ${story.points}` : null,
      story.comments ? `Comments: ${story.comments}` : null,
    ].filter(Boolean).join('\n'),
    url: story.url,
    publishedAt: null,
  }))
}

async function hogFirebaseNewsEvidence(feed: 'top' | 'new' | 'best', limit: number): Promise<EvidenceSeed[]> {
  const idsResponse = await fetch(`https://hacker-news.firebaseio.com/v0/${feed}stories.json`)
  if (!idsResponse.ok) throw new Error(`HOG Hacker News fallback failed: ${idsResponse.status} ${idsResponse.statusText}`)

  const ids = await idsResponse.json() as number[]
  const stories = await Promise.all(ids.slice(0, limit).map(fetchHogStory))

  return stories.filter(isUsefulHogStory).map((story) => ({
    sourceKind: 'hog_news',
    sourceRef: `hn:${story.id}`,
    title: story.title ?? `Hacker News item ${story.id}`,
    content: hogStoryContent(story),
    url: story.url ?? `https://news.ycombinator.com/item?id=${story.id}`,
    publishedAt: story.time ? new Date(story.time * 1000).toISOString() : null,
  }))
}

async function fetchWebText(url: string): Promise<string> {
  if (hasHogCredentials()) return hogScrape(url)

  const response = await fetch(url)
  if (!response.ok) throw new Error(`Web fetch failed for ${url}: ${response.status} ${response.statusText}`)
  return response.text()
}

async function hogScrape(url: string): Promise<string> {
  const response = await fetch(`${hogBaseUrl()}/api/v1/platform/scrapers/web/scrape`, {
    method: 'POST',
    headers: hogHeaders(),
    body: JSON.stringify({ url, renderJs: false }),
  })

  if (!response.ok) throw new Error(`HOG scrape failed for ${url}: ${response.status} ${await response.text()}`)
  const data = await response.json() as HogScrapeResult
  const operationId = data.operationId ?? data.id
  if (operationId) return pollHogOperation(operationId)

  return hogResultText(data)
}

async function pollHogOperation(id: string, maxWaitMs = 30_000): Promise<string> {
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    await sleep(2_000)
    const response = await fetch(`${hogBaseUrl()}/api/operations/${id}`, { headers: hogHeaders() })
    if (!response.ok) throw new Error(`HOG operation poll failed for ${id}: ${response.status}`)

    const data = await response.json() as HogScrapeResult
    if (data.status === 'completed') return hogResultText(data.result ?? data)
    if (data.status === 'failed') throw new Error(`HOG operation failed for ${id}`)
  }

  throw new Error(`HOG operation timed out for ${id}`)
}

function hogResultText(data: HogScrapeResult): string {
  return data.content ??
    data.html ??
    data.markdown ??
    data.text ??
    data.data?.content ??
    data.data?.html ??
    data.data?.markdown ??
    data.data?.text ??
    JSON.stringify(data)
}

async function markSourceChecked(sourceId: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('brain_sources')
    .update({ last_checked_at: new Date().toISOString() })
    .eq('id', sourceId)

  if (error) throw error
}

function parseArxiv(xml: string): ArxivEntry[] {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((match) => {
    const entry = match[1]
    const id = textBetween(entry, 'id')
    const arxivId = id.split('/abs/')[1] ?? id
    return {
      arxivId: arxivId.trim(),
      title: cleanXmlText(textBetween(entry, 'title')),
      abstract: cleanXmlText(textBetween(entry, 'summary')),
      authors: [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((author) => cleanXmlText(author[1])),
      url: id.trim(),
      publishedAt: textBetween(entry, 'published') || null,
    }
  })
}

function parseRss(xml: string, feedUrl: string): EvidenceSeed[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 25).map((match, index) => {
    const item = match[1]
    const title = cleanXmlText(textBetween(item, 'title')) || `${feedUrl} item ${index + 1}`
    const description = cleanXmlText(textBetween(item, 'description'))
    const link = cleanXmlText(textBetween(item, 'link')) || feedUrl
    return {
      sourceKind: 'rss_feed',
      sourceRef: link,
      title,
      content: description || title,
      url: link,
      publishedAt: cleanXmlText(textBetween(item, 'pubDate')) || null,
    }
  })
}

function textBetween(xml: string, tag: string): string {
  return xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1] ?? ''
}

function cleanXmlText(value: string): string {
  return decodeEntities(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return match ? decodeEntities(match[1].replace(/<[^>]+>/g, ' ')).trim() : null
}

function extractBlocks(html: string): string[] {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  return [...cleaned.matchAll(/<(p|li|h1|h2|h3)[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((match) => decodeEntities(match[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim())
    .filter((text) => text.length >= 80 && text.length <= 2_000)
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function asObject(value: Json): Record<string, Json> {
  return typeof value === 'object' && value != null && !Array.isArray(value) ? value as Record<string, Json> : {}
}

function requireConfigString(config: Record<string, Json>, key: string): string {
  const value = config[key]
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`Missing source config string: ${key}`)
  return value
}

function normalizeHogFeed(value: string): 'top' | 'new' | 'best' {
  if (value === 'new') return 'new'
  if (value === 'best') return 'best'
  return 'top'
}

function parseHackerNewsText(text: string, limit: number): Array<{
  sourceRef: string
  title: string
  url: string
  points: string | null
  comments: string | null
}> {
  const htmlStories = parseHackerNewsHtml(text, limit)
  return htmlStories.length > 0 ? htmlStories : parseHackerNewsMarkdown(text, limit)
}

function parseHackerNewsHtml(html: string, limit: number): Array<{
  sourceRef: string
  title: string
  url: string
  points: string | null
  comments: string | null
}> {
  const rows = [...html.matchAll(/<tr class=['"]athing['"][^>]*id=['"](\d+)['"][\s\S]*?<\/tr>\s*<tr[\s\S]*?<\/tr>/g)]
  return rows.slice(0, limit).map((match) => {
    const id = match[1]
    const row = match[0]
    const titleMatch = row.match(/<span class=['"]titleline['"][\s\S]*?<a href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/)
    const pointsMatch = row.match(/<span class=['"]score['"][^>]*>([^<]+)<\/span>/)
    const commentsMatch = row.match(/>(\d+)&nbsp;comments<\/a>/)
    const rawUrl = titleMatch?.[1] ?? `https://news.ycombinator.com/item?id=${id}`
    const title = titleMatch ? cleanXmlText(titleMatch[2]) : `Hacker News item ${id}`

    return {
      sourceRef: `hn:${id}`,
      title,
      url: absolutizeHackerNewsUrl(rawUrl),
      points: pointsMatch ? cleanXmlText(pointsMatch[1]) : null,
      comments: commentsMatch ? commentsMatch[1] : null,
    }
  }).filter((story) => story.title.trim().length > 0)
}

function parseHackerNewsMarkdown(text: string, limit: number): Array<{
  sourceRef: string
  title: string
  url: string
  points: string | null
  comments: string | null
}> {
  return text
    .split(/\n(?=\d+\.\n)/)
    .map((block) => {
      const id = block.match(/vote\?id=(\d+)/)?.[1] ?? block.match(/item\?id=(\d+)/)?.[1]
      const storyLink = [...block.matchAll(/\[([^\]\n]{4,220})\]\((https?:\/\/[^)]+)\)/g)]
        .find((match) => !match[2].includes('news.ycombinator.com'))
      if (!id || !storyLink) return null

      const points = block.match(/(\d+\s+points?)/)?.[1] ?? null
      const comments = block.match(/(\d+)[\s\u00a0]+comments/)?.[1] ?? null
      return {
        sourceRef: `hn:${id}`,
        title: cleanXmlText(storyLink[1]),
        url: storyLink[2],
        points,
        comments,
      }
    })
    .filter((story): story is NonNullable<typeof story> => Boolean(story))
    .slice(0, limit)
}

function hasHogCredentials(): boolean {
  return Boolean(process.env.HOG_ACCESS_KEY && process.env.HOG_SECRET_KEY)
}

function hogBaseUrl(): string {
  return process.env.HOG_BASE_URL?.replace(/\/$/, '') || 'https://developer.thehog.ai'
}

function hogHeaders(): Record<string, string> {
  if (!process.env.HOG_ACCESS_KEY || !process.env.HOG_SECRET_KEY) {
    throw new Error('HOG_ACCESS_KEY and HOG_SECRET_KEY are required for HOG scraping')
  }

  return {
    'X-Access-Key': process.env.HOG_ACCESS_KEY,
    'X-Secret-Key': process.env.HOG_SECRET_KEY,
    'Content-Type': 'application/json',
  }
}

function absolutizeHackerNewsUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  return `https://news.ycombinator.com/${url.replace(/^\//, '')}`
}

function clampLimit(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.floor(value)))
}

function isUsefulHogStory(story: HogStory): boolean {
  return story.type === 'story' && typeof story.title === 'string' && story.title.trim().length > 0
}

function hogStoryContent(story: HogStory): string {
  const parts = [
    `Hacker News ${story.type ?? 'story'}: ${story.title ?? `item ${story.id}`}`,
    story.url ? `URL: ${story.url}` : null,
    story.by ? `Author: ${story.by}` : null,
    typeof story.score === 'number' ? `Score: ${story.score}` : null,
    typeof story.descendants === 'number' ? `Comments: ${story.descendants}` : null,
    story.text ? cleanXmlText(story.text) : null,
  ].filter(Boolean)

  return parts.join('\n')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function splitEnv(value: string | undefined): string[] {
  return value?.split(',').map((item) => item.trim()).filter(Boolean) ?? []
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
