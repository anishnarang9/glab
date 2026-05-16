// Promote researcher artifacts into the Central GBrain.

import { shareArtifact } from '@/lib/artifacts'

async function main(): Promise<void> {
  const ids = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
  if (ids.length === 0) usage()

  for (const id of ids) {
    const result = await shareArtifact(id)
    console.log(`shared artifact:${result.artifact.id}`)
    if (result.evidence) {
      console.log(`evidence:${result.evidence.id}`)
    }
  }
}

function usage(): never {
  console.error('Usage: bun cli/share.ts <artifact-id> [artifact-id...]')
  process.exit(1)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
