import { strict as assert } from 'node:assert'
import { hashText } from '@/lib/brain'
import { selectPendingSharedArtifacts } from '@/lib/shared-artifact-ingestion'

const brainId = 'brain-main'
const content = 'Shared experimental result with enough detail to become evidence.'
const duplicateContent = 'Already known shared result with enough detail to hash.'

const pending = selectPendingSharedArtifacts(
  [
    {
      id: 'adopt-me',
      brain_id: null,
      tier: 'shared',
      content,
      created_at: '2026-05-16T00:00:00.000Z',
    },
    {
      id: 'already-by-artifact',
      brain_id: brainId,
      tier: 'shared',
      content: 'This artifact already has evidence.',
      created_at: '2026-05-16T00:01:00.000Z',
    },
    {
      id: 'already-by-hash',
      brain_id: brainId,
      tier: 'shared',
      content: duplicateContent,
      created_at: '2026-05-16T00:02:00.000Z',
    },
    {
      id: 'private-artifact',
      brain_id: brainId,
      tier: 'private',
      content: 'Private data must not become shared evidence.',
      created_at: '2026-05-16T00:03:00.000Z',
    },
    {
      id: 'other-brain',
      brain_id: 'other-brain',
      tier: 'shared',
      content: 'Shared elsewhere but not visible to this head brain.',
      created_at: '2026-05-16T00:04:00.000Z',
    },
  ],
  [
    {
      artifact_id: 'already-by-artifact',
      content_hash: hashText('This artifact already has evidence.'),
    },
    {
      artifact_id: null,
      content_hash: hashText(duplicateContent),
    },
  ],
  brainId,
)

assert.deepEqual(
  pending.map((artifact) => artifact.id),
  ['adopt-me'],
)

console.log('Shared artifact ingestion verification passed')
