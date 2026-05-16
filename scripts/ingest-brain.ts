// Central GBrain ingestion runner. Used by manual runs and Railway cron.

import {
  createBrainCommit,
  createEvidenceItem,
  ensureBrainSource,
  ensureDefaultBrain,
  finishIngestionRun,
  startIngestionRun,
} from '@/lib/brain'
import { supabaseAdmin } from '@/lib/supabase'
import { maintainTruthFromEvidence } from '@/lib/truth'
import type { Brain, BrainSource, IngestionRunTrigger, Json, Paper } from '@/db/client'

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

async function main(): Promise<void> {
  const trigger = parseTrigger()
  const brain = await ensureDefaultBrain()
  await ensureConfiguredSources(brain)
  const sources = await enabledSources(brain.id)

  if (sources.length === 0) {
    console.log(`No enabled sources for brain ${brain.name}`)
    return
  }

  let createdEvidence = 0
  for (const source of sources) {
    createdEvidence += await ingestSource(brain, source, trigger)
  }

  console.log(`Central GBrain ingestion complete: ${createdEvidence} new evidence items`)
}

function parseTrigger(): IngestionRunTrigger {
  const argv = (globalThis as unknown as { Bun?: { argv: string[] } }).Bun?.argv.slice(2) ?? []
  const triggerIndex = argv.indexOf('--trigger')
  if (triggerIndex === -1) return 'manual'
  const value = argv[triggerIndex + 1]
  if (value === 'morning_cron' || value === 'manual' || value === 'source_refresh') return value
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
      await maintainTruthFromEvidence({ brainId: brain.id, evidence })
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

  return data.map((artifact) => ({
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
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Web fetch failed for ${url}: ${response.status} ${response.statusText}`)
  const html = await response.text()
  return extractBlocks(html).slice(0, 12).map((content, index) => ({
    sourceKind: 'web_page',
    sourceRef: `${url}#block-${index + 1}`,
    title: extractTitle(html) ?? url,
    content,
    url,
  }))
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

function splitEnv(value: string | undefined): string[] {
  return value?.split(',').map((item) => item.trim()).filter(Boolean) ?? []
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
