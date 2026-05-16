// P2 — HTTP handler. Joins artifacts + paper_matches per researcher.
import { supabaseAdmin } from "@/lib/supabase";
import type { Researcher, Artifact } from "@/db/client";

interface PaperRow {
  id: string;
  title: string;
  authors: string[] | null;
  arxiv_id: string | null;
  published_at: string | null;
}

interface MatchRow {
  id: string;
  researcher_id: string | null;
  relationship: string | null;
  rationale: string | null;
  confidence: number | null;
  created_at: string;
  papers: PaperRow | null;
}

export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseAdmin() as any;

  const [{ data: researchers }, { data: artifacts }, { data: matches }] =
    await Promise.all([
      supabase.from("researchers").select("*").order("name") as Promise<{ data: Researcher[] }>,
      supabase
        .from("artifacts")
        .select("id, owner_id, type, title, content")
        .eq("tier", "shared")
        .eq("type", "project") as Promise<{ data: Pick<Artifact, "id" | "owner_id" | "type" | "title" | "content">[] }>,
      supabase
        .from("paper_matches")
        .select(`id, researcher_id, relationship, rationale, confidence, created_at, papers (id, title, authors, arxiv_id, published_at)`)
        .order("created_at", { ascending: false }) as Promise<{ data: MatchRow[] }>,
    ]);

  const data = (researchers ?? []).map((r: Researcher) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    created_at: r.created_at,
    projects: (artifacts ?? []).filter((a) => a.owner_id === r.id),
    matches: (matches ?? [])
      .filter((m: MatchRow) => m.researcher_id === r.id)
      .slice(0, 3),
  }));

  return Response.json({ researchers: data });
}
