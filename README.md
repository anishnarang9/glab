# Cortex

**The shared brain for your research lab.**

Every researcher has their own notes, papers, and findings scattered across their laptop. Cortex reads each researcher's personal knowledge base, filters out the noise, and pulls only the lab-relevant work into one shared brain — so the whole team can search it, new hires can onboard instantly, and no one loses a week to something a teammate already knew.

---

## What it does

1. **Personal GBrains** — each researcher has an AI (powered by [GBrain](https://github.com/gstack-ai/gstack)) that captures everything they do: notes, papers, experiments, findings, hypotheses.

2. **Selective pull** — Cortex reads each researcher's personal files, scores them for lab relevance, and promotes only the work-related ones into a central shared database. Your grocery list stays private. Your fMRI findings go to the lab.

3. **Paper agents** — nightly agents scrape leading research labs and match new papers to each researcher's active projects using semantic embeddings + an LLM judge.

4. **One searchable lab brain** — any researcher can ask "what is Clara working on?" or "what papers relate to my motor BCI project?" and get an instant answer drawn from the whole team's knowledge.

---

## Demo use cases

| Use case | How |
|----------|-----|
| **Onboarding** | New hire asks the lab brain anything — project context, methods, who to talk to |
| **Staying current** | Daily digest of new papers matched and annotated per researcher |
| **Team visibility** | Dashboard showing what every lab member is actively building |

---

## Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 16 + TypeScript + Bun |
| Database | Supabase (Postgres + pgvector) |
| Embeddings | Voyage AI `voyage-3-lite` (1024 dim) |
| LLM | Anthropic Claude (onboarding Q&A + paper–project matching) |
| Personal GBrain | [GBrain](https://github.com/gstack-ai/gstack) via OpenClaw |
| Paper scraping | The Hog web scraper API |
| Email | Resend |

---

## Setup

```bash
cp .env.example .env.local   # fill in keys (see below)
bun install

# Apply schema to Supabase:
# Dashboard → SQL editor → paste db/schema.sql → run
# Then paste db/seed.sql → run

bun dev
```

### Required environment variables

```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
VOYAGE_API_KEY
HOG_ACCESS_KEY
HOG_SECRET_KEY
RESEND_API_KEY          # optional — falls back to console
```

---

## Scripts

```bash
bun run fetch-arxiv     # scrape leading lab publication pages → upsert papers
bun run match-papers    # match papers to researcher projects via LLM judge
bun run render-digest   # render per-researcher paper digest as markdown
bun run send-digest     # email digest to all researchers
bun run seed-corpus     # seed demo-data artifacts into Supabase
```

---

## Project layout

```
app/          Next.js routes (/team, /onboard, /upload)
components/   React components
lib/          Supabase, embeddings, Anthropic, artifacts, email
db/           schema.sql, seed.sql, typed DB client
prompts/      onboarding Q&A and relationship judge prompts
scripts/      paper fetch, matching, digest, seeding
cli/          researcher GBrain sharing helpers
demo-data/    mock researcher artifacts for demo seeding
docs/         feature specs and migration notes
```

---

## Team

Built at [hackathon] by a 4-person team in 24 hours.

- **P1** — Infra, DB schema, Supabase, paper scraping
- **P2** — Web app (Next.js routes, React components)
- **P3** — AI pipeline (embeddings, LLM judge, paper matching)
- **P4** — CLI, artifact ingestion, digest delivery
