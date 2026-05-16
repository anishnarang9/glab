// Seeds shared researcher markdown artifacts through createArtifact(), so shared
// rows become Central GBrain evidence and pass through OpenClaw truth maintenance.

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  createArtifact,
  isArtifactType,
  isTier,
  listResearchers,
  upsertResearcher,
  type ArtifactType,
  type CreateArtifactInput,
  type ResearcherRecord,
  type Tier,
} from '@/lib/artifacts'
import { embedBatch } from '@/lib/embeddings'

type BunRuntime = {
  argv: string[]
}

type CliArgs = {
  urls: string[]
  ownerId?: string
  limit: number
  dryRun: boolean
  skipDemo: boolean
  skipEmbeddings: boolean
  demoDataDir: string
}

type SeedArtifact = {
  title: string
  type: ArtifactType
  tier: Tier
  content: string
  ownerKey?: string
}

const DEMO_DATA_DIR = join(process.cwd(), 'demo-data')

const RESEARCHER_EMAILS: Record<string, string> = {
  'alice-chen': 'alice@lab.demo',
  'bob-okafor': 'bob@lab.demo',
  'clara-mendez': 'clara@lab.demo',
  'david-kim': 'david@lab.demo',
}

const DEMO_RESEARCHERS = [
  {
    name: 'Alice Chen',
    email: 'alice@lab.demo',
    focus: 'fMRI decoding and visual cortex representation geometry',
    method: 'RSA, CLIP alignment, surface preprocessing, and multimodal embedding comparisons',
    risk: 'papers that change the model comparison baseline could alter the shared interpretation',
  },
  {
    name: 'Bob Okafor',
    email: 'bob@lab.demo',
    focus: 'connectome-scale circuit analysis and cortical microstructure',
    method: 'synapse graphs, selectivity statistics, and layer-specific circuit modeling',
    risk: 'new connectomics results may change which circuit motifs matter',
  },
  {
    name: 'Clara Mendez',
    email: 'clara@lab.demo',
    focus: 'motor BCI decoding and cross-session neural dynamics',
    method: 'rotational dynamics, calibration transfer, and frequency-domain decoding',
    risk: 'new BCI benchmarks may expose session drift in the current decoder',
  },
  {
    name: 'David Kim',
    email: 'david@lab.demo',
    focus: 'neural dynamics, criticality, and shared lab memory systems',
    method: 'mean-field models, subspace comparison, and retrieval-grounded reasoning',
    risk: 'generic semantic search is not enough without relationship labels and ownership',
  },
] as const

async function main(): Promise<void> {
  const args = parseArgs(runtimeArgs())
  const markdownArtifacts = args.skipDemo ? [] : await readMarkdownArtifacts(args.demoDataDir)
  const scraped = await scrapeArtifacts(args.urls)
  const fallbackDemo = markdownArtifacts.length === 0 && !args.skipDemo ? buildFallbackDemoArtifacts() : []
  const seedArtifacts = [...markdownArtifacts, ...fallbackDemo, ...scraped].slice(0, args.limit)

  if (seedArtifacts.length === 0) {
    throw new Error('No seed artifacts found. Pass --url <lab-page>, keep demo-data, or omit --skip-demo.')
  }

  if (args.dryRun) {
    printDryRun(seedArtifacts)
    return
  }

  const owners = await resolveOwners(args.ownerId)
  const ownerByEmail = new Map(owners.map((owner) => [owner.email, owner]))
  const ownerByKey = new Map(Object.entries(RESEARCHER_EMAILS).map(([key, email]) => [key, ownerByEmail.get(email)]))
  const embeddings = args.skipEmbeddings ? [] : await maybeEmbedBatch(seedArtifacts)
  let inserted = 0

  for (let index = 0; index < seedArtifacts.length; index += 1) {
    const seed = seedArtifacts[index]
    const owner = seed.ownerKey ? ownerByKey.get(seed.ownerKey) ?? owners[index % owners.length] : owners[index % owners.length]
    const input: CreateArtifactInput = {
      ownerId: owner.id,
      type: seed.type,
      title: seed.title,
      content: seed.content,
      tier: seed.tier,
      embedding: embeddings[index] ?? null,
    }

    const created = await createArtifact(input)
    inserted += 1
    console.log(`seeded ${inserted}/${seedArtifacts.length}: ${created.title ?? seed.title} -> ${owner.name}`)
  }

  if (embeddings.length === 0 && !args.skipEmbeddings) {
    console.warn('Seeded without embeddings because VOYAGE_API_KEY is unavailable or embedding failed.')
  }
  console.log(`Done. Inserted ${inserted} artifacts through Central GBrain ingestion (${embeddings.length} with embeddings).`)
}

function runtimeArgs(): string[] {
  const runtime = globalThis as unknown as { Bun?: BunRuntime }
  if (!runtime.Bun) {
    throw new Error('Run this script with Bun: bun scripts/seed-corpus.ts')
  }
  return runtime.Bun.argv.slice(2)
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    urls: envList('LABBRAIN_SEED_URLS'),
    limit: 40,
    dryRun: false,
    skipDemo: false,
    skipEmbeddings: false,
    demoDataDir: process.env.LABBRAIN_DEMO_DATA_DIR ?? DEMO_DATA_DIR,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    switch (token) {
      case '--url':
        args.urls.push(requireValue(argv, ++i, '--url'))
        break
      case '--owner':
        args.ownerId = requireValue(argv, ++i, '--owner')
        break
      case '--limit':
        args.limit = Number.parseInt(requireValue(argv, ++i, '--limit'), 10)
        break
      case '--demo-data-dir':
        args.demoDataDir = requireValue(argv, ++i, '--demo-data-dir')
        break
      case '--dry-run':
        args.dryRun = true
        break
      case '--skip-demo':
        args.skipDemo = true
        break
      case '--skip-embeddings':
        args.skipEmbeddings = true
        break
      case '--help':
        printUsage()
        break
      default:
        throw new Error(`Unknown argument: ${token}`)
    }
  }

  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 200) {
    throw new Error('--limit must be an integer between 1 and 200.')
  }

  return args
}

async function readMarkdownArtifacts(dir: string): Promise<SeedArtifact[]> {
  const folders = await readdir(dir).catch(() => [])
  const artifacts: SeedArtifact[] = []

  for (const folder of folders) {
    if (folder.endsWith('-personal')) continue
    const ownerKey = folder
    const folderPath = join(dir, folder)
    const files = await readdir(folderPath).catch(() => [])

    for (const file of files) {
      if (!file.endsWith('.md')) continue
      const raw = await readFile(join(folderPath, file), 'utf8')
      const { meta, content } = parseFrontmatter(raw)
      const type = isArtifactType(meta.type ?? '') ? meta.type as ArtifactType : 'note'
      const tier = isTier(meta.tier ?? '') ? meta.tier as Tier : 'shared'
      artifacts.push({
        ownerKey,
        type,
        tier,
        title: meta.title ?? titleFromContent(content),
        content,
      })
    }
  }

  return artifacts
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; content: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { meta: {}, content: raw.trim() }

  const meta: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':')
    if (key && rest.length > 0) {
      meta[key.trim()] = rest.join(':').trim().replace(/^"|"$/g, '')
    }
  }

  return { meta, content: match[2].trim() }
}

async function resolveOwners(ownerId?: string): Promise<ResearcherRecord[]> {
  if (ownerId) {
    return [{ id: ownerId, name: 'Provided owner', email: 'provided-owner@labbrain.local', created_at: new Date().toISOString() }]
  }

  const existing = await listResearchers()
  const byEmail = new Map(existing.map((researcher) => [researcher.email, researcher]))
  const owners = [...existing]

  for (const researcher of DEMO_RESEARCHERS) {
    if (!byEmail.has(researcher.email)) {
      owners.push(await upsertResearcher({ name: researcher.name, email: researcher.email }))
    }
  }

  return owners
}

function buildFallbackDemoArtifacts(): SeedArtifact[] {
  return DEMO_RESEARCHERS.flatMap((researcher) => [
    {
      type: 'project',
      tier: 'shared',
      title: `${researcher.name}: ${researcher.focus}`,
      content: `${researcher.name} is leading a project on ${researcher.focus}. The current method uses ${researcher.method}. The work is looking for papers that validate assumptions, suggest a change in the method, extend the project, or scoop the core idea.`,
    },
    {
      type: 'finding',
      tier: 'shared',
      title: `${researcher.name} latest finding`,
      content: `Latest finding for ${researcher.focus}: early experiments work when retrieval context includes concrete methods, datasets, and failure cases. Thin abstract matches are noisy unless the judge quotes the paper and active project directly.`,
    },
    {
      type: 'hypothesis',
      tier: 'shared',
      title: `${researcher.name} working hypothesis`,
      content: `Working hypothesis: ${researcher.focus} will improve fastest if new papers are ranked by relationship type, not only vector similarity. The team cares about validates, suggests_change, extends, and scoops labels.`,
    },
    {
      type: 'note',
      tier: 'shared',
      title: `${researcher.name} demo note`,
      content: `Shared lab note: ${researcher.method} is the main technical stack. The biggest known risk is that ${researcher.risk}.`,
    },
  ])
}

async function scrapeArtifacts(urls: string[]): Promise<SeedArtifact[]> {
  const all: SeedArtifact[] = []

  for (const url of urls) {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
    }

    const html = await response.text()
    const title = extractTitle(html) || new URL(url).hostname
    const blocks = extractBlocks(html).slice(0, 12)

    blocks.forEach((block, index) => {
      all.push({
        type: index % 3 === 0 ? 'project' : 'paper_ref',
        tier: 'shared',
        title: `${title} source ${index + 1}`,
        content: `Seeded from ${url}\n\n${block}`,
      })
    })
  }

  return all
}

async function maybeEmbedBatch(seedArtifacts: SeedArtifact[]): Promise<Array<number[] | null>> {
  if (!process.env.VOYAGE_API_KEY) return []

  try {
    return await embedBatch(seedArtifacts.map((artifact) => `${artifact.title}\n${artifact.content}`))
  } catch (error) {
    console.warn(`Embedding failed; inserting rows without vectors: ${error instanceof Error ? error.message : String(error)}`)
    return []
  }
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return match ? decodeEntities(stripTags(match[1])).trim() : null
}

function extractBlocks(html: string): string[] {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const matches = [...cleaned.matchAll(/<(p|li|h1|h2|h3)[^>]*>([\s\S]*?)<\/\1>/gi)]

  return matches
    .map((match) => decodeEntities(stripTags(match[2])).replace(/\s+/g, ' ').trim())
    .filter((text) => text.length >= 80 && text.length <= 2_000)
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, ' ')
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function titleFromContent(content: string): string {
  const firstLine = content.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? 'Untitled artifact'
  return firstLine.replace(/^#+\s*/, '').slice(0, 180)
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index]
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value.`)
  }
  return value
}

function envList(name: string): string[] {
  const value = process.env[name]
  return value?.split(',').map((item) => item.trim()).filter(Boolean) ?? []
}

function printDryRun(seedArtifacts: SeedArtifact[]): void {
  console.log(`Would seed ${seedArtifacts.length} artifacts:`)
  for (const artifact of seedArtifacts) {
    console.log(`- [${artifact.tier}/${artifact.type}] ${artifact.title}`)
  }
}

function printUsage(): never {
  console.log(`Usage: bun scripts/seed-corpus.ts [--url <lab-page>] [--demo-data-dir <dir>] [--owner <researcher-id>] [--limit 40] [--dry-run]

Options:
  --url <lab-page>       Add a PI/lab web page to scrape. Repeatable.
  --demo-data-dir <dir>  Directory of researcher markdown folders. Default: demo-data.
  --owner <id>           Assign all inserted artifacts to one researcher.
  --limit <n>            Insert up to n artifacts. Default: 40.
  --skip-demo            Skip markdown demo-data and fallback demo artifacts.
  --skip-embeddings      Do not call Voyage embeddings.
  --dry-run              Print planned artifacts without inserting.`)
  throw new Error('Help requested.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
