// P3 — for each new paper: pgvector top-5 candidate projects → judgeRelationship() → upsert paper_matches.
// Run with: bun scripts/match-papers.ts

import { supabaseAdmin } from "@/lib/supabase";
import { judgeRelationship } from "@/lib/anthropic";

const CANDIDATE_COUNT = 5;

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseAdmin() as any;

  // Fetch all papers that have embeddings
  const { data: papers, error: pErr } = await supabase
    .from("papers")
    .select("id, title, abstract, embedding")
    .not("embedding", "is", null);

  if (pErr || !papers) { console.error("Failed to fetch papers:", pErr); process.exit(1); }
  console.log(`Processing ${papers.length} papers...`);

  for (const paper of papers) {
    // Top-5 shared project artifacts by cosine similarity
    const { data: candidates, error: cErr } = await supabase.rpc("match_artifacts", {
      query_embedding: paper.embedding,
      match_count: CANDIDATE_COUNT,
    });

    if (cErr || !candidates?.length) {
      console.log(`  No candidates for: ${paper.title.slice(0, 60)}`);
      continue;
    }

    console.log(`  Judging ${candidates.length} candidates for: ${paper.title.slice(0, 60)}`);

    for (const artifact of candidates) {
      // Fetch the owner's researcher id
      const { data: artifactRow } = await supabase
        .from("artifacts")
        .select("owner_id")
        .eq("id", artifact.id)
        .single();

      const result = await judgeRelationship(
        { title: paper.title, abstract: paper.abstract },
        { title: artifact.title, content: artifact.content }
      );

      if (result.relationship === "orthogonal" && result.confidence < 0.4) continue;

      await supabase.from("paper_matches").upsert({
        paper_id: paper.id,
        project_artifact_id: artifact.id,
        researcher_id: artifactRow?.owner_id ?? null,
        relationship: result.relationship,
        rationale: result.rationale,
        confidence: result.confidence,
      }, { onConflict: "paper_id,project_artifact_id" });

      console.log(`    → ${result.relationship} (${result.confidence.toFixed(2)}): ${artifact.title ?? artifact.id}`);

      // Small delay to avoid rate limits
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  console.log("✓ Done matching papers.");
}

main();
