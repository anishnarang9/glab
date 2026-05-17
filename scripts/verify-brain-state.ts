import { strict as assert } from 'node:assert'
import {
  buildTruthContext,
  computePendingEvidenceCount,
  isWorkerHeartbeatFresh,
} from '@/lib/brain-state'

const context = buildTruthContext({
  claims: [
    {
      id: 'claim-1',
      statement: 'Visual cortex responses align with CLIP embeddings.',
      status: 'active',
      confidence: 0.82,
      updated_at: '2026-05-16T01:00:00.000Z',
    },
  ],
  evidence: [
    {
      id: 'evidence-1',
      title: 'fMRI hyperalignment session note',
      source_kind: 'researcher_shared_artifacts',
      source_ref: 'artifact-1',
      url: null,
      created_at: '2026-05-16T00:30:00.000Z',
    },
  ],
  commits: [
    {
      id: 'commit-1',
      kind: 'claim_refined',
      summary: 'OpenClaw refined visual cortex CLIP claim.',
      created_at: '2026-05-16T01:01:00.000Z',
    },
  ],
})

assert(context.includes('[claim:claim-1]'))
assert(context.includes('Visual cortex responses align with CLIP embeddings.'))
assert(context.includes('[evidence:evidence-1]'))
assert(context.includes('[commit:commit-1]'))

assert.equal(computePendingEvidenceCount(['e1', 'e2', 'e3'], ['e1', 'e3']), 1)
assert.equal(isWorkerHeartbeatFresh('2026-05-16T00:01:00.000Z', Date.parse('2026-05-16T00:02:00.000Z'), 120_000), true)
assert.equal(isWorkerHeartbeatFresh('2026-05-16T00:00:00.000Z', Date.parse('2026-05-16T00:03:00.000Z'), 120_000), false)
assert.equal(isWorkerHeartbeatFresh(null, Date.parse('2026-05-16T00:02:00.000Z'), 120_000), false)

console.log('Central brain state verification passed')
