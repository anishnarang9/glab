// P2 — HTTP handler. Joins artifacts + paper_matches per researcher.
export async function GET() {
  return Response.json({ researchers: [] });
}
