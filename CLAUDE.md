# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

**Pre-implementation.** This repo contains the architecture plan for LabBrain (a research-lab knowledge system built on top of gstack GBrain) but no code yet. Before suggesting commands or running tools, check whether scaffolding actually exists — there is no `package.json`, no test runner, no build pipeline as of the initial commit.

The full plan is in `ARCHITECTURE.md`. Read it before proposing implementation changes. The locked decisions below come from a `/plan-eng-review` session and **should not be re-litigated** — propose changes only if implementation surfaces a concrete reason the decision was wrong.

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
