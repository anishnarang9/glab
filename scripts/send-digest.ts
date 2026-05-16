// Send a Central GBrain digest built from recent brain commits.

import { sendDigest } from '@/lib/email'
import { ensureDefaultBrain } from '@/lib/brain'
import { supabaseAdmin } from '@/lib/supabase'
import type { BrainCommit, Researcher } from '@/db/client'

type Args = {
  to?: string
  dryRun: boolean
  limit: number
}

async function main(): Promise<void> {
  const args = parseArgs()
  const brain = await ensureDefaultBrain()
  const commits = await latestCommits(brain.id, args.limit)
  const markdown = renderDigest(brain.name, commits)
  const recipients = args.to ? [{ email: args.to, name: args.to }] : await researchers()

  if (recipients.length === 0) {
    throw new Error('No digest recipients found. Pass --to <email> or seed researchers.')
  }

  for (const recipient of recipients) {
    const result = await sendDigest(recipient.email, markdown, {
      dryRun: args.dryRun,
      subject: `${brain.name} update: ${commits.length} brain commits`,
    })
    console.log(`${recipient.email}: ${result.provider}${result.sent ? ` ${result.id ?? ''}` : ' fallback'}`)
  }
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const limitValue = valueAfter(argv, '--limit')
  const limit = limitValue ? Number.parseInt(limitValue, 10) : 10
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new Error('--limit must be an integer between 1 and 50')
  }

  return {
    to: valueAfter(argv, '--to'),
    dryRun: argv.includes('--dry-run'),
    limit,
  }
}

async function latestCommits(brainId: string, limit: number): Promise<BrainCommit[]> {
  const { data, error } = await supabaseAdmin()
    .from('brain_commits')
    .select()
    .eq('brain_id', brainId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data
}

async function researchers(): Promise<Researcher[]> {
  const { data, error } = await supabaseAdmin().from('researchers').select().order('name')
  if (error) throw error
  return data
}

function renderDigest(brainName: string, commits: BrainCommit[]): string {
  if (commits.length === 0) {
    return `# ${brainName} update\n\nNo new Central GBrain commits yet.`
  }

  return [
    `# ${brainName} update`,
    '',
    `The Central GBrain recorded ${commits.length} recent update${commits.length === 1 ? '' : 's'}.`,
    '',
    ...commits.map((commit) => [
      `## ${commit.summary}`,
      '',
      `- Kind: ${commit.kind}`,
      `- Commit: ${commit.commit_hash.slice(0, 12)}`,
      `- Created: ${commit.created_at}`,
      '',
    ].join('\n')),
  ].join('\n')
}

function valueAfter(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)
  if (index === -1) return undefined
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
