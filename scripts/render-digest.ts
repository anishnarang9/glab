// P3 — per-researcher markdown digest of recent paper_matches.
// Exports: renderDigestForResearcher(id: string): string
// Run standalone: bun scripts/render-digest.ts

import { supabaseAdmin } from "@/lib/supabase";

const RELATIONSHIP_LABELS: Record<string, string> = {
  validates: "✅ Validates",
  extends: "📖 Extends",
  suggests_change: "⚠️ Suggests change",
  scoops: "🚨 Scoops",
  orthogonal: "↔️ Orthogonal",
};

export async function renderDigestForResearcher(researcherId: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseAdmin() as any;

  const { data: researcher } = await supabase
    .from("researchers")
    .select("name, email")
    .eq("id", researcherId)
    .single();

  if (!researcher) return "";

  const { data: matches } = await supabase
    .from("paper_matches")
    .select(`
      relationship,
      rationale,
      confidence,
      papers (title, abstract, authors, arxiv_id, published_at),
      artifacts:project_artifact_id (title, content)
    `)
    .eq("researcher_id", researcherId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (!matches?.length) {
    return `# LabBrain Digest — ${researcher.name}\n\nNo new matched papers today.`;
  }

  const lines: string[] = [
    `# LabBrain Digest — ${researcher.name}`,
    `*${new Date().toDateString()}*`,
    "",
    `${matches.length} paper${matches.length === 1 ? "" : "s"} matched to your work:`,
    "",
  ];

  for (const m of matches) {
    const paper = m.papers;
    const project = m.artifacts;
    const label = RELATIONSHIP_LABELS[m.relationship ?? "orthogonal"] ?? m.relationship;
    const authors = paper?.authors?.slice(0, 3).join(", ") + (paper?.authors?.length > 3 ? " et al." : "");

    lines.push(`## ${paper?.title ?? "Untitled"}`);
    lines.push(`*${authors}*`);
    if (paper?.arxiv_id) lines.push(`arXiv: ${paper.arxiv_id}`);
    lines.push("");
    lines.push(`**${label}** your project *${project?.title ?? "untitled"}*`);
    lines.push("");
    lines.push(`> ${m.rationale}`);
    lines.push("");
    lines.push(`Confidence: ${((m.confidence ?? 0) * 100).toFixed(0)}%`);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

// Standalone runner
async function main() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseAdmin() as any;
  const { data: researchers } = await supabase.from("researchers").select("id, name");

  for (const r of researchers ?? []) {
    console.log(`\n${"=".repeat(60)}`);
    const digest = await renderDigestForResearcher(r.id);
    console.log(digest);
  }
}

main();
