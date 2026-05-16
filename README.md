# LabBrain

Central GBrain for research labs. The product is a persistent brain entity that
ingests papers, news, web sources, and shared researcher updates; maintains
evidence-backed truth claims; and emits mini git-like commits whenever its
understanding changes.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the current Central GBrain plan and
[`CLAUDE.md`](./CLAUDE.md) for coding guidance.

## Stack

TypeScript + Bun + Next.js + Supabase/pgvector. Voyage embeddings (1024 dim).
Anthropic for claim extraction, truth comparison, and researcher relevance.
Railway is the preferred first deployment target for the web service plus
scheduled Central GBrain worker.

## Setup

```bash
cp .env.example .env.local   # fill in Supabase, Anthropic, Voyage keys
bun install

# Apply schema + seed to your Supabase project:
#   Supabase dashboard → SQL editor → paste db/schema.sql → run
#   then paste db/seed.sql → run

bun dev
```

Central GBrain worker commands are being added under `scripts/`:

```bash
bun run brain:ingest     # run the central ingestion/truth loop once
bun run brain:morning    # morning scheduled run for Railway cron
```

## Layout

```
app/         Next.js routes + API handlers
components/  React components
lib/         Supabase, Central GBrain, truth, artifact, email helpers
db/          schema, seed, typed database contract
prompts/     Q&A, relationship judge, truth-maintenance prompts
scripts/     source ingestion, truth loop, digest rendering/sending
cli/         researcher GBrain sharing helpers
```

The old "shared rows equal GTeam" plan is superseded. Shared researcher artifacts
are now inputs into the Central GBrain, not the source of truth itself.
