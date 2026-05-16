import { listResearchers } from '@/lib/artifacts'

export async function GET() {
  const researchers = await listResearchers()
  return Response.json({ researchers })
}
