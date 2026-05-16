// P4 — scrape PI lab page (regex-extract project descriptions + pub abstracts), bulk-insert as shared artifacts.
// Critical for demo: targets ~30-50 shared artifacts before demo day.

import {
  createArtifact,
  listResearchers,
  upsertResearcher,
  type ArtifactType,
  type CreateArtifactInput,
  type ResearcherRecord,
} from "../lib/artifacts";

type BunRuntime = {
  argv: string[];
};

type CliArgs = {
  urls: string[];
  ownerId?: string;
  limit: number;
  dryRun: boolean;
  skipDemo: boolean;
  skipEmbeddings: boolean;
};

type SeedArtifact = {
  title: string;
  type: ArtifactType;
  content: string;
};

type EmbedFn = (text: string) => Promise<number[]>;

const DEMO_RESEARCHERS = [
  {
    name: "Alice Chen",
    email: "alice.chen@labbrain.demo",
    focus: "diffusion models for low-dose microscopy reconstruction",
    method: "score distillation, uncertainty calibration, and synthetic microscope noise",
    risk: "papers that improve sample efficiency could obsolete the current training schedule",
  },
  {
    name: "Ben Patel",
    email: "ben.patel@labbrain.demo",
    focus: "robotic wet-lab planning for protein stability screens",
    method: "Bayesian optimization, active learning, and liquid-handler constraints",
    risk: "closed-loop planning papers may change the acquisition function choice",
  },
  {
    name: "Carla Nguyen",
    email: "carla.nguyen@labbrain.demo",
    focus: "causal representation learning for single-cell perturbation data",
    method: "contrastive objectives, intervention graphs, and gene-program discovery",
    risk: "new benchmarks may expose shortcut learning in the current embedding space",
  },
  {
    name: "Dev Shah",
    email: "dev.shah@labbrain.demo",
    focus: "lab memory systems that connect papers, notes, and active hypotheses",
    method: "retrieval, citation grounding, and researcher-specific relevance scoring",
    risk: "generic semantic search is not enough without relationship labels and ownership",
  },
] as const;

async function main(): Promise<void> {
  const args = parseArgs(runtimeArgs());
  const scraped = await scrapeArtifacts(args.urls);
  const demo = args.skipDemo ? [] : buildDemoArtifacts();
  const seedArtifacts = [...demo, ...scraped].slice(0, args.limit);

  if (seedArtifacts.length === 0) {
    throw new Error("No seed artifacts found. Pass --url <lab-page> or omit --skip-demo.");
  }

  if (args.dryRun) {
    printDryRun(seedArtifacts);
    return;
  }

  const owners = await resolveOwners(args.ownerId);
  const embed = args.skipEmbeddings ? undefined : await loadEmbedder();
  let embedded = 0;
  let inserted = 0;

  for (let index = 0; index < seedArtifacts.length; index += 1) {
    const seed = seedArtifacts[index];
    const owner = owners[index % owners.length];
    const embedding = embed ? await maybeEmbed(embed, seed.content) : null;
    if (embedding) {
      embedded += 1;
    }

    const input: CreateArtifactInput = {
      ownerId: owner.id,
      type: seed.type,
      title: seed.title,
      content: seed.content,
      tier: "shared",
      embedding,
    };

    const created = await createArtifact(input);
    inserted += 1;
    console.log(`seeded ${inserted}/${seedArtifacts.length}: ${created.title ?? seed.title} -> ${owner.name}`);
  }

  if (!embed) {
    console.warn("Seeded without embeddings because P3 embed(text) is not available yet or embedding env is missing.");
  }
  console.log(`Done. Inserted ${inserted} shared artifacts (${embedded} with embeddings).`);
}

function runtimeArgs(): string[] {
  const runtime = globalThis as unknown as { Bun?: BunRuntime };
  if (!runtime.Bun) {
    throw new Error("Run this script with Bun: bun scripts/seed-corpus.ts");
  }
  return runtime.Bun.argv.slice(2);
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    urls: envList("LABBRAIN_SEED_URLS"),
    limit: 40,
    dryRun: false,
    skipDemo: false,
    skipEmbeddings: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    switch (token) {
      case "--url":
        args.urls.push(requireValue(argv, ++i, "--url"));
        break;
      case "--owner":
        args.ownerId = requireValue(argv, ++i, "--owner");
        break;
      case "--limit":
        args.limit = Number.parseInt(requireValue(argv, ++i, "--limit"), 10);
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--skip-demo":
        args.skipDemo = true;
        break;
      case "--skip-embeddings":
        args.skipEmbeddings = true;
        break;
      case "--help":
        printUsage();
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 200) {
    throw new Error("--limit must be an integer between 1 and 200.");
  }

  return args;
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function envList(name: string): string[] {
  const runtime = globalThis as unknown as { process?: { env?: Record<string, string | undefined> }; Bun?: { env?: Record<string, string | undefined> } };
  const value = runtime.process?.env?.[name] ?? runtime.Bun?.env?.[name];
  return value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
}

async function resolveOwners(ownerId?: string): Promise<ResearcherRecord[]> {
  if (ownerId) {
    return [{ id: ownerId, name: "Provided owner", email: "provided-owner@labbrain.local", created_at: new Date().toISOString() }];
  }

  const existing = await listResearchers();
  if (existing.length > 0) {
    return existing;
  }

  const created: ResearcherRecord[] = [];
  for (const researcher of DEMO_RESEARCHERS) {
    created.push(await upsertResearcher({ name: researcher.name, email: researcher.email }));
  }
  return created;
}

function buildDemoArtifacts(): SeedArtifact[] {
  return DEMO_RESEARCHERS.flatMap((researcher) => [
    {
      type: "project",
      title: `${researcher.name}: ${researcher.focus}`,
      content: `${researcher.name} is leading a project on ${researcher.focus}. The current method uses ${researcher.method}. The work is looking for papers that validate assumptions, suggest a change in the method, extend the project, or scoop the core idea.`,
    },
    {
      type: "finding",
      title: `${researcher.name} latest finding`,
      content: `Latest finding for ${researcher.focus}: early experiments work when the retrieval context includes concrete methods, datasets, and failure cases. Thin abstract matches are noisy unless the judge quotes the paper and the active project directly.`,
    },
    {
      type: "hypothesis",
      title: `${researcher.name} working hypothesis`,
      content: `Working hypothesis: ${researcher.focus} will improve fastest if new papers are ranked by relationship type, not only vector similarity. The team cares about validates, suggests_change, extends, and scoops labels.`,
    },
    {
      type: "note",
      title: `${researcher.name} demo note`,
      content: `Shared lab note: ${researcher.method} is the main technical stack. The biggest known risk is that ${researcher.risk}.`,
    },
    {
      type: "paper_ref",
      title: `${researcher.name} related paper queue`,
      content: `Paper queue for ${researcher.focus}: prioritize papers with reproducible experiments, clear ablations, and direct comparison against methods using ${researcher.method}.`,
    },
    {
      type: "finding",
      title: `${researcher.name} relevance rule`,
      content: `Relevance rule: a paper is useful to ${researcher.name} if it changes what the researcher should try this week. Generic shared vocabulary is orthogonal unless it affects ${researcher.focus}.`,
    },
    {
      type: "project",
      title: `${researcher.name} next milestone`,
      content: `Next milestone: produce a small demo showing how ${researcher.focus} reacts to three new papers. One paper should validate the direction, one should suggest a change, and one should look like a scoop.`,
    },
    {
      type: "note",
      title: `${researcher.name} onboarding context`,
      content: `If a new lab member asks who is working on ${keywordFromFocus(researcher.focus)}, answer with ${researcher.name}, summarize ${researcher.focus}, and cite the active project artifact.`,
    },
  ]);
}

async function scrapeArtifacts(urls: string[]): Promise<SeedArtifact[]> {
  const all: SeedArtifact[] = [];

  for (const url of urls) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const title = extractTitle(html) || new URL(url).hostname;
    const blocks = extractBlocks(html).slice(0, 12);

    blocks.forEach((block, index) => {
      all.push({
        type: index % 3 === 0 ? "project" : "paper_ref",
        title: `${title} source ${index + 1}`,
        content: `Seeded from ${url}\n\n${block}`,
      });
    });
  }

  return all;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeEntities(stripTags(match[1])).trim() : null;
}

function extractBlocks(html: string): string[] {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const matches = [...cleaned.matchAll(/<(p|li|h1|h2|h3)[^>]*>([\s\S]*?)<\/\1>/gi)];

  return matches
    .map((match) => decodeEntities(stripTags(match[2])).replace(/\s+/g, " ").trim())
    .filter((text) => text.length >= 80 && text.length <= 2_000);
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function loadEmbedder(): Promise<EmbedFn | undefined> {
  const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;
  const mod = await dynamicImport("../lib/embeddings").catch(() => undefined) as { embed?: EmbedFn } | undefined;
  return typeof mod?.embed === "function" ? mod.embed : undefined;
}

async function maybeEmbed(embed: EmbedFn, content: string): Promise<number[] | null> {
  try {
    return await embed(content);
  } catch (error) {
    console.warn(`Embedding failed; inserting row without vector: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function keywordFromFocus(focus: string): string {
  return focus.split(/\s+/).slice(0, 4).join(" ");
}

function printDryRun(seedArtifacts: SeedArtifact[]): void {
  console.log(`Would seed ${seedArtifacts.length} shared artifacts:`);
  for (const artifact of seedArtifacts) {
    console.log(`- [${artifact.type}] ${artifact.title}`);
  }
}

function printUsage(): never {
  console.log(`Usage: bun scripts/seed-corpus.ts [--url <lab-page>] [--owner <researcher-id>] [--limit 40] [--dry-run]

Options:
  --url <lab-page>       Add a PI/lab web page to scrape. Repeatable.
  --owner <id>           Assign all inserted artifacts to one researcher.
  --limit <n>            Insert up to n artifacts. Default: 40.
  --skip-demo            Only use scraped URL content.
  --skip-embeddings      Do not call P3 embed(text), even if available.
  --dry-run              Print planned artifacts without inserting.`);
  throw new Error("Help requested.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  const runtime = globalThis as unknown as { process?: { exitCode?: number } };
  if (runtime.process) {
    runtime.process.exitCode = 1;
  }
});
