// Ingest a researcher-owned file. Use --share to feed it into the Central GBrain.

import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { createArtifact, isArtifactType, type ArtifactType, type Tier } from '@/lib/artifacts'

type Args = {
  file: string
  ownerId: string
  type: ArtifactType
  title?: string
  tier: Tier
}

async function main(): Promise<void> {
  const args = parseArgs()
  const content = await readFile(args.file, 'utf8')
  const artifact = await createArtifact({
    ownerId: args.ownerId,
    type: args.type,
    title: args.title ?? basename(args.file),
    content,
    tier: args.tier,
  })

  console.log(`artifact:${artifact.id}`)
  console.log(`tier:${artifact.tier}`)
  if (artifact.tier === 'shared') {
    console.log('central-gbrain: evidence + commit created')
  }
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const file = argv.find((arg) => !arg.startsWith('--'))
  const ownerId = valueAfter(argv, '--owner')
  const typeValue = valueAfter(argv, '--type') ?? 'note'
  const title = valueAfter(argv, '--title')
  const tier: Tier = argv.includes('--share') ? 'shared' : 'private'

  if (!file) usage('Missing file path')
  if (!ownerId) usage('Missing --owner <researcher-id>')
  if (!isArtifactType(typeValue)) usage(`Invalid --type ${typeValue}`)

  return {
    file,
    ownerId,
    type: typeValue,
    title,
    tier,
  }
}

function valueAfter(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)
  if (index === -1) return undefined
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) usage(`${flag} requires a value`)
  return value
}

function usage(message: string): never {
  console.error(message)
  console.error('Usage: bun cli/gbrain-research.ts <file> --owner <id> [--type note|project|paper_ref|finding|hypothesis] [--title <title>] [--share]')
  process.exit(1)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
