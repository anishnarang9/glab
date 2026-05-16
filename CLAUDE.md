# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

**Scaffolding complete; implementation not started.** The full file/folder tree exists with empty stub files — each stub's top comment names its owner (P1/P2/P3/P4). `package.json`, `tsconfig.json`, `bunfig.toml`, `next.config.ts`, `.env.example`, `.gitignore` are populated with minimal config. `bun install` has not been run; dependencies are empty in `package.json` and must be added by P1 as needed.

The full plan is in `ARCHITECTURE.md`. The 4-person work split is in `/Users/raghavaggarwal/.claude/plans/how-can-we-split-modular-russell.md`. The locked decisions below come from a `/plan-eng-review` session and **should not be re-litigated** — propose changes only if implementation surfaces a concrete reason the decision was wrong.

## Product (one paragraph)

LabBrain has three use cases, all shipped thin in v1:
1. **Onboarding** — new researcher queries the lab's history and active projects.
2. **Staying current** — daily email digest of new arXiv papers with claim-level annotation per researcher (`validates` / `suggests_change` / `extends` / `scoops` / `orthogonal`) + rationale.
3. **Team visibility** — web dashboard showing what each lab member is working on.

**Target shape: hackathon demo, not a production system.** Engineer for "the 6-beat demo script in ARCHITECTURE.md works end-to-end." Skip production-grade auth, sync pipelines, multi-tenancy, eval suites.

## Locked architectural decisions

| ID | Decision |
|----|----------|
| D1 | All three use cases ship thin in v1 — none gets full depth. |
| D2 | Per-researcher "GBrain" = existing gstack GBrain CLI, extended with research-artifact ingestion. Do NOT rebuild vector store / MCP / sync from scratch. |
| D3 | Privacy = opt-in. `artifacts.tier` defaults to `'private'`; the user must explicitly tag `'shared'` for an artifact to reach lab-wide queries. |
| D4 | Storage = **single Supabase Postgres** with a `tier` column on every artifact (collapsed from the production "local PGLite + cloud GTeam" design for hackathon scope). No real sync pipeline. |
| D3a | GTeam seeded at lab setup by ingesting PI-provided sources (lab webpage, prior pubs, grant abstracts). Ongoing growth via smart "Share with lab?" prompt at artifact creation. |
| D5 | Single-node deployment. No SaaS infrastructure, no self-host story. |
| D6 | Paper-to-work matching is two-stage: **pgvector top-5 cosine prefilter** → **Anthropic LLM judge per (paper, project) pair** producing JSON `{relationship, rationale, confidence}`. Real-time API, not batch. |
| D10 | Three surfaces only: gbrain CLI (ingestion), Next.js web app (3 routes: `/upload`, `/onboard`, `/team`), email digest (rendered markdown). No Slack, no IDE plugin, no browser extension. |
| D11 | Stack: TypeScript + Bun + Next.js + Supabase. One language end-to-end. |
| D11a | Embeddings: Voyage AI (`voyage-3` or `voyage-3-lite`), **1024 dimensions**. Lock this at hour 0 — dimension mismatch mid-build forces re-embedding. |

## Explicitly NOT in scope

These were considered and deferred. Don't add them without checking first.

- Real auth (Google SSO, RLS, roles, multi-lab)
- A sync pipeline for local → cloud (D4 was collapsed to one DB)
- Slack / Notion / Google Drive / Zotero ingestion adapters
- Self-host packaging
- Eval suite for the matcher (hand-test 5 curated pairs instead)
- Anthropic batch API (volumes are tiny — pay the real-time premium)
- Broad test coverage; performance optimization

## Data model

The hackathon schema lives in the `## Data model (hackathon-grade)` section of `ARCHITECTURE.md`. Four tables: `researchers`, `artifacts` (with `tier` + `type` + `embedding`), `papers`, `paper_matches`. The `vector(1024)` dimension MUST match Voyage's output — do not change without re-embedding.

## Hackathon failure modes to actively defend against

From the architecture plan's risk section — these are the ones most likely to bite:

1. **Matcher prompt quality.** The relationship taxonomy is the demo's punchline. Hand-test on 5 curated (paper, project) pairs before demo. Watch for the judge defaulting to `orthogonal` when unsure — lower the confidence instead.
2. **Anthropic / Voyage rate limit on demo day.** Pre-render the digest to disk; only the onboarding Q&A should hit a live API on stage.
3. **Empty arXiv response.** Pre-cache 2-3 days of papers so the demo doesn't depend on arXiv on the day.
4. **Sparse GTeam.** Seed ~30-50 shared artifacts before demo, not 3-5. Onboarding query returns nothing on a near-empty store.

## Team roles — work in parallel, merge cleanly

Four roles, each with a non-overlapping set of files. Stub files in the repo are tagged with `P1`/`P2`/`P3`/`P4` in their top-line comment — that comment is the source of truth for ownership. The rule: **only edit files tagged with your role's letter.** Cross-role coupling happens through library exports (contracts below), not by editing each other's files.

### Branching + merge protocol

- Each role works on a branch: `p1-infra`, `p2-web`, `p3-ai`, `p4-cli`.
- Merge order matters (it matches the dependency chain):
  1. **P1 merges first** — schema, env, `lib/supabase.ts`. Everyone rebases off main.
  2. **P4 merges `lib/artifacts.ts` next** — unblocks P2's upload form.
  3. **P3 merges `lib/embeddings.ts` + `lib/anthropic.ts`** — unblocks P2's onboard route.
  4. **P2 and the rest of P3/P4 merge in parallel** — no shared files left.
- Rebase before pushing. Never force-push to main.

### P1 — Infra / DB

Owns scaffolding, Supabase, schema, env, deployment.

**Files:** `package.json`, `tsconfig.json`, `bunfig.toml`, `next.config.ts`, `.env.example`, `.gitignore`, `README.md`, `db/schema.sql`, `db/seed.sql`, `db/client.ts`, `lib/supabase.ts`.

**Exports the team relies on:**
- `lib/supabase.ts` → `supabaseAdmin()` (service-role client) and `supabaseAnon()` (browser client).
- `db/client.ts` → typed query helpers if needed.

**Hour 0-2 unblocker:** apply `db/schema.sql` to Supabase, populate `.env.example`, export `lib/supabase.ts`. Push to main. Everyone else is blocked until this lands.

### P2 — Web App

Owns the Next.js routes, API handlers, and React components.

**Files:** everything under `app/` and `components/`.

**Imports from other roles:**
- `lib/supabase.ts` (P1) — DB access.
- `lib/artifacts.ts` (P4) — `createArtifact()`, `defaultTierFor(type)` for the upload form checkbox.
- `lib/embeddings.ts` (P3) — `embed(text)` for the onboarding query.
- `lib/anthropic.ts` (P3) — `streamChat(messages)` for the streaming Q&A response.

**Can start hour 0:** scaffold UI with mock data. Wire to real libraries as upstream lands.

### P3 — AI Pipeline

Owns embeddings, LLM judge, prompts, and the paper-pipeline scripts.

**Files:** `lib/embeddings.ts`, `lib/anthropic.ts`, `prompts/onboarding-qa.md`, `prompts/relationship-judge.md`, `scripts/fetch-arxiv.ts`, `scripts/match-papers.ts`, `scripts/render-digest.ts`.

**Exports the team relies on:**
- `lib/embeddings.ts` → `embed(text: string): Promise<number[]>` (1024-dim Voyage `voyage-3-lite`) and `embedBatch(texts: string[])`.
- `lib/anthropic.ts` → `streamChat(messages)` for the Q&A and `judgeRelationship(paper, project)` returning `{relationship, rationale, confidence}` JSON.
- `scripts/render-digest.ts` → `renderDigestForResearcher(id: string): string` (P4's `send-digest.ts` imports this).

**Owns the demo's killer-feature risk:** matcher prompt quality. Hand-test the judge on 5 curated `(paper, project)` pairs before demo.

### P4 — CLI + Ingestion + Seeding

Owns artifact rules, the gbrain CLI extension, seed corpus, and digest delivery.

**Files:** `lib/artifacts.ts`, `lib/email.ts`, `scripts/send-digest.ts`, `scripts/seed-corpus.ts`, `cli/gbrain-research.ts`, `cli/share.ts`.

**Exports the team relies on:**
- `lib/artifacts.ts` → `ArtifactType`, `Tier`, `defaultTierFor(type)`, `createArtifact(input)`, `sharePromptCopy(type)`. P2's upload form depends on this by hour 4.
- `lib/email.ts` → `sendDigest(to, markdown)` (Resend or console fallback).

**Demo-critical:** seed ~30-50 shared artifacts before demo day or the onboarding query returns nothing.

### Cross-role contracts (don't break these without telling the importers)

| Export | Owner | Importers |
|--------|-------|-----------|
| `lib/supabase.ts: supabaseAdmin/supabaseAnon` | P1 | P2, P3, P4 |
| `lib/artifacts.ts: createArtifact, defaultTierFor` | P4 | P2 |
| `lib/embeddings.ts: embed, embedBatch` | P3 | P2 (onboarding), P3 (own scripts) |
| `lib/anthropic.ts: streamChat, judgeRelationship` | P3 | P2 (onboarding), P3 (match-papers) |
| `scripts/render-digest.ts: renderDigestForResearcher` | P3 | P4 (send-digest) |
| `lib/email.ts: sendDigest` | P4 | P4 (send-digest) |

## Skill routing

When the user's request matches an available gstack skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas / brainstorming → invoke `/office-hours`
- Strategy / scope → invoke `/plan-ceo-review`
- Architecture → invoke `/plan-eng-review`
- Design system / plan review → invoke `/design-consultation` or `/plan-design-review`
- Full review pipeline → invoke `/autoplan`
- Bugs / errors → invoke `/investigate`
- QA / testing site behavior → invoke `/qa` or `/qa-only`
- Code review / diff check → invoke `/review`
- Visual polish → invoke `/design-review`
- Ship / deploy / PR → invoke `/ship` or `/land-and-deploy`
- Save progress → invoke `/context-save`
- Resume context → invoke `/context-restore`
