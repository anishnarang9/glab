/**
 * seed-gtech-lab.ts
 *
 * Seeds the 5 GTech Lab shared documents into the Supabase artifacts table.
 * Creates a "GTech Lab" researcher entry as owner if it doesn't exist.
 *
 * Usage: bun scripts/seed-gtech-lab.ts
 * Env:   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { supabaseAdmin } from '@/lib/supabase'

const LAB_DOCS = [
  { file: 'lab-overview.md',        type: 'note'    },
  { file: 'research-areas.md',      type: 'note'    },
  { file: 'active-projects-2026.md', type: 'project' },
  { file: 'lab-protocols.md',       type: 'note'    },
  { file: 'onboarding-guide.md',    type: 'note'    },
] as const

const DIR = join(process.cwd(), 'demo-data/gtech-lab')
const LAB_EMAIL = 'lab@gtech.demo'

async function main() {
  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter(k => !process.env[k])
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')}`)

  const db = supabaseAdmin()

  // Upsert the lab-level researcher entry
  const { data: labResearcher, error: resErr } = await db
    .from('researchers')
    .upsert({ name: 'GTech Lab', email: LAB_EMAIL }, { onConflict: 'email' })
    .select('id')
    .single()

  if (resErr || !labResearcher) {
    throw new Error(`Failed to upsert GTech Lab researcher: ${resErr?.message}`)
  }

  console.log(`GTech Lab researcher id: ${labResearcher.id}\n`)

  for (const { file, type } of LAB_DOCS) {
    const raw = await readFile(join(DIR, file), 'utf8')
    const title = raw.split('\n')[0].replace(/^#+\s*/, '').trim()

    const { error } = await db.from('artifacts').insert({
      owner_id: labResearcher.id,
      type,
      tier: 'shared',
      title,
      content: raw,
    })

    if (error) {
      console.error(`  ✗ ${file}: ${error.message}`)
    } else {
      console.log(`  ✓ ${title}`)
    }
  }

  console.log('\nDone. GTech Lab docs are now in Supabase as shared artifacts.')
}

main().catch(err => { console.error(err instanceof Error ? err.message : err); process.exit(1) })
