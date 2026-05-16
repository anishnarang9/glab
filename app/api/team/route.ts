// P2 — HTTP handler. Joins artifacts + paper_matches per researcher.
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const supabase = supabaseAdmin();

  const [{ data: researchers }, { data: artifacts }, { data: matches }] =
    await Promise.all([
      supabase.from("researchers").select("*").order("name"),
      supabase
        .from("artifacts")
        .select("id, owner_id, type, title, content")
        .eq("tier", "shared")
        .eq("type", "project"),
      supabase
        .from("paper_matches")
        .select(`
          id,
          researcher_id,
          relationship,
          rationale,
          confidence,
          created_at,
          papers (
            id,
            title,
            authors,
            arxiv_id,
            published_at
          )
        `)
        .order("created_at", { ascending: false }),
    ]);

  const data = (researchers ?? []).map((r) => ({
    ...r,
    projects: (artifacts ?? []).filter((a) => a.owner_id === r.id),
    matches: (matches ?? [])
      .filter((m) => m.researcher_id === r.id)
      .slice(0, 3),
  }));

  return Response.json({ researchers: data });
}
