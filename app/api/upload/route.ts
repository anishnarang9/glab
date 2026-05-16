import { createArtifact, isArtifactType, isTier } from '@/lib/artifacts'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const type = typeof body.type === 'string' && isArtifactType(body.type) ? body.type : null
  const tier = typeof body.tier === 'string' && isTier(body.tier) ? body.tier : 'private'
  const ownerId = readString(body.owner_id)
  const content = readString(body.content)

  if (!type) return Response.json({ error: 'Valid artifact type is required' }, { status: 400 })
  if (!ownerId) return Response.json({ error: 'owner_id is required' }, { status: 400 })
  if (!content) return Response.json({ error: 'content is required' }, { status: 400 })

  const artifact = await createArtifact({
    ownerId,
    type,
    tier,
    content,
    title: readString(body.title),
  })

  return Response.json({ artifact })
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
