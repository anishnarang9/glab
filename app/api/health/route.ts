export async function GET() {
  return Response.json({
    ok: true,
    service: 'labbrain',
    brain: process.env.LABBRAIN_DEFAULT_BRAIN_NAME ?? 'LabBrain',
  })
}
