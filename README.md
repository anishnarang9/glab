# LabBrain

Research-lab knowledge system. Hackathon build. See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for design, [`CLAUDE.md`](./CLAUDE.md) for guidance to Claude Code, and `.claude/plans/how-can-we-split-modular-russell.md` for the 4-person work split.

## Stack

TypeScript + Bun + Next.js + Supabase. Voyage embeddings (1024 dim). Anthropic LLM judge.

## Setup

```bash
cp .env.example .env.local   # fill in Supabase, Anthropic, Voyage keys
bun install

# Apply schema + seed to your Supabase project:
#   Supabase dashboard → SQL editor → paste db/schema.sql → run
#   then paste db/seed.sql → run

bun dev
```

## Layout

```
app/         Next.js routes + API handlers       (P2)
components/  React components                    (P2)
lib/         shared clients + artifact rules     (P1, P3, P4)
db/          schema, seed, client                (P1)
prompts/     Q&A and relationship-judge prompts  (P3)
scripts/     arXiv pipeline, digest renderer     (P3, P4)
cli/         gbrain extensions                   (P4)
```

Each stub file's top comment names its owner per the work split.
