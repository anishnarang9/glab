import { strict as assert } from 'node:assert'
import { localOpenClawPolicy, normalizeRemoteDecision, type EvidenceObservation } from '@/lib/openclaw'
import { findBestClaimForStatement, selectClaimStatement } from '@/lib/truth'

const observation = {
  brain: {
    id: 'brain-main',
    name: 'LabBrain',
    subject: 'GTech neuroscience lab research',
    mission: 'Maintain evidence-backed shared truth for the lab.',
  },
  evidence: {
    id: 'evidence-1',
    source_kind: 'researcher_shared_artifacts',
    source_ref: 'artifact-1',
    title: 'Draft note with noisy local title',
    content: 'Visual cortex object responses align with CLIP embedding geometry across repeated fMRI sessions and improve after hyperalignment.',
    url: null,
    published_at: null,
  },
  currentClaims: [
    {
      id: 'claim-clip',
      statement: 'Visual cortex object responses align with CLIP embeddings.',
      status: 'active',
      confidence: 0.71,
      updated_at: '2026-05-16T00:00:00.000Z',
    },
    {
      id: 'claim-bci',
      statement: 'Motor BCI decoding improves with cross-session calibration.',
      status: 'active',
      confidence: 0.64,
      updated_at: '2026-05-15T00:00:00.000Z',
    },
  ],
  recentCommits: [],
} satisfies EvidenceObservation

const remoteDecision = normalizeRemoteDecision(
  {
    decision: {
      decision_type: 'claim_refined',
      normalized_claim: 'Visual cortex object responses align with CLIP embeddings.',
      relationship: 'refines',
      rationale: 'The evidence adds repeated-session support to the existing visual cortex claim.',
      confidence: 1.4,
      payload: { source: 'remote-openclaw' },
    },
  },
  observation,
)

assert.equal(remoteDecision.decisionType, 'claim_refined')
assert.equal(remoteDecision.subject, 'Visual cortex object responses align with CLIP embeddings.')
assert.equal(remoteDecision.relationship, 'refines')
assert.equal(remoteDecision.confidence, 1)
assert.deepEqual(remoteDecision.payload, {
  source: 'remote-openclaw',
  decision_mode: 'remote_openclaw',
  normalized_statement: 'Visual cortex object responses align with CLIP embeddings.',
})

const fallbackDecision = localOpenClawPolicy(observation, 'OpenClaw decision endpoint failed: 503 Service Unavailable')
const fallbackPayload = fallbackDecision.payload as Record<string, unknown>
assert.equal(fallbackPayload.decision_mode, 'local_openclaw_fallback')
assert.equal(fallbackPayload.fallback_reason, 'OpenClaw decision endpoint failed: 503 Service Unavailable')

assert.equal(
  selectClaimStatement({
    evidence: observation.evidence,
    preferredStatement: remoteDecision.subject,
  }),
  'Visual cortex object responses align with CLIP embeddings.',
)

const match = findBestClaimForStatement(
  'Visual cortex object responses align with CLIP embedding geometry across repeated sessions.',
  observation.currentClaims,
)

assert.equal(match?.id, 'claim-clip')

console.log('OpenClaw and truth verification passed')
