// P4 — scrape PI lab page (regex-extract project descriptions + pub abstracts), bulk-insert as shared artifacts.
// Critical for demo: targets ~30-50 shared artifacts before demo day.
// Run with: bun scripts/seed-corpus.ts

import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { supabaseAdmin } from "@/lib/supabase";
import { embedBatch } from "@/lib/embeddings";

const DEMO_DATA_DIR = join(process.cwd(), "demo-data");

// Researcher email mapping (matches seed.sql)
const RESEARCHER_EMAILS: Record<string, string> = {
  "alice-chen": "alice@lab.demo",
  "bob-okafor": "bob@lab.demo",
  "clara-mendez": "clara@lab.demo",
  "david-kim": "david@lab.demo",
};

function parseFrontmatter(raw: string): { meta: Record<string, string>; content: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, content: raw };
  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const [key, ...rest] = line.split(":");
    if (key && rest.length) meta[key.trim()] = rest.join(":").trim().replace(/^"|"$/g, "");
  }
  return { meta, content: match[2].trim() };
}

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseAdmin() as any;

  // Fetch researchers from DB
  const { data: researchers, error: rErr } = await supabase.from("researchers").select("id, email");
  if (rErr || !researchers) { console.error("Failed to fetch researchers:", rErr); process.exit(1); }
  const emailToId = Object.fromEntries((researchers as { id: string; email: string }[]).map((r) => [r.email, r.id]));

  const folders = await readdir(DEMO_DATA_DIR);
  const toInsert: {
    owner_id: string;
    type: string;
    tier: string;
    title: string | null;
    content: string;
  }[] = [];

  for (const folder of folders) {
    // Skip personal folders — only ingest shared research artifacts
    if (folder.endsWith("-personal")) continue;
    const email = RESEARCHER_EMAILS[folder];
    const ownerId = email ? emailToId[email] : null;
    if (!ownerId) { console.warn(`No researcher found for folder: ${folder}`); continue; }

    const files = await readdir(join(DEMO_DATA_DIR, folder));
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const raw = await readFile(join(DEMO_DATA_DIR, folder, file), "utf-8");
      const { meta, content } = parseFrontmatter(raw);
      const type = meta.type ?? "note";
      const tier = meta.tier ?? "private";
      const title = meta.title ?? null;
      toInsert.push({ owner_id: ownerId, type, tier, title, content });
    }
  }

  console.log(`Embedding ${toInsert.length} artifacts...`);
  const embeddings = await embedBatch(toInsert.map((a) => `${a.title ?? ""}\n${a.content}`));

  const rows = toInsert.map((a, i) => ({ ...a, embedding: embeddings[i] }));

  const { error: insertErr } = await supabase.from("artifacts").upsert(rows, { ignoreDuplicates: false });
  if (insertErr) { console.error("Insert failed:", insertErr); process.exit(1); }

  console.log(`✓ Seeded ${rows.length} artifacts into Supabase.`);
}

main();
