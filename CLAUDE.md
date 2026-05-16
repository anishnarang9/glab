# CLAUDE.md

This file guides coding agents working in this repository.

## Project state

The architecture has been reset. The old plan treated `artifacts.tier='shared'`
as the shared lab brain. That is superseded.

The product center is now **Central GBrain**: a persistent brain entity that
ingests new research data, maintains evidence-backed truth claims, and writes
mini git-like commits whenever its understanding changes.

OpenClaw is the autonomous operator for the head Central GBrain. It decides
whether new evidence is relevant, records that decision, and only then applies
truth changes.

Current branch: `P4An`.

Important current state:

- P1 infra has merged into `main`: Supabase schema, typed DB contract, deps.
- This branch may contain WIP from the old P4 plan in `lib/artifacts.ts`,
  `lib/email.ts`, and `scripts/seed-corpus.ts`; adapt it to Central GBrain.
- Do not keep building the old "shared rows are the central truth" model.

## Product model

Central GBrain is the brain entity for a lab/topic.

```text
researcher GBrains ─┐
arXiv / HOG / web ─┼──▶ evidence queue ───▶ OpenClaw head operator
manual uploads    ─┘                                  │
                                                      ▼
                                             Central GBrain
                                                  │
                                                  ├──▶ onboarding answers
                                                  ├──▶ team dashboard
                                                  └──▶ digests / alerts
```

Researcher GBrains are sub-identities. They can keep private artifacts, or
explicitly share an artifact into the Central GBrain. Shared artifacts become
evidence, not final truth.

Researcher GBrains do not run OpenClaw in this pass. They are data sources. The
head Central GBrain's OpenClaw instance is the only autonomous truth-maintenance
operator.

## Locked decisions

| ID | Decision |
|----|----------|
| D1 | The Central GBrain is first-class. Supabase stores its memory; Supabase is not the product. |
| D2 | Every meaningful brain update writes a `brain_commit`. New evidence must not silently overwrite truth. |
| D3 | Truth maintenance is essential: evidence can support, contradict, refine, duplicate, or be orthogonal to claims. |
| D4 | Researcher privacy stays opt-in. `artifacts.tier='shared'` feeds the Central GBrain; private artifacts stay private. |
| D5 | Morning runs are one trigger, not the whole architecture. Mid-day researcher shares also create commits. |
| D6 | First deployment target: Supabase + Railway web service + Railway worker/cron. |
| D7 | Voyage embeddings remain 1024-dimensional unless the whole schema and stored vectors are migrated. |
| D8 | First pass should be complete enough to show evidence, claims, commits, and digest/dashboard output. Do not overbuild multi-lab auth/sync. |
| D9 | OpenClaw controls the head Central GBrain; smaller researcher GBrains only send data. |
| D10 | OpenClaw decisions are persisted before truth claims are created, refined, or contested. |

## Data model

Base tables from P1:

- `researchers`
- `artifacts`
- `papers`
- `paper_matches`

Central GBrain additions:

- `brains`
- `brain_sources`
- `openclaw_instances`
- `ingestion_runs`
- `evidence_items`
- `openclaw_decisions`
- `truth_claims`
- `truth_revisions`
- `truth_evidence_edges`
- `brain_commits`
- `brain_commit_changes`

Table meanings:

- `artifacts`: researcher-owned input; `shared` artifacts feed the brain.
- `papers`: raw paper records; paper abstracts can become evidence.
- `evidence_items`: immutable-ish facts/snippets the brain can cite.
- `openclaw_instances`: registered operator for the head Central GBrain.
- `openclaw_decisions`: relevance/action decisions before truth mutation.
- `truth_claims`: current brain beliefs.
- `truth_revisions`: claim history.
- `brain_commits`: "what changed" events.
- `brain_commit_changes`: structured diff rows for each commit.

## Truth loop

```text
new data arrives
      |
      v
normalize + dedupe
      |
      v
store evidence item
      |
      v
OpenClaw observes evidence + current truth
      |
      v
OpenClaw decides relevance + relationship
      |
      +--> skip
      +--> supports
      +--> contradicts
      +--> refines
      +--> creates
      |
      v
write brain_commit + changes
```

Rules:

- Dedupe before creating commits.
- Claims must cite evidence.
- Contradictions are stored, not hidden.
- Failed ingestion writes `ingestion_runs.error`.
- Digest/dashboard should read commits and truth state, not raw artifacts alone.

## Team/workstream guidance

The previous role-only file ownership was useful for the old scaffold, but the
Central GBrain reset crosses P1/P3/P4 boundaries. Coordinate by module:

| Lane | Modules | Purpose |
|------|---------|---------|
| A | `db/` | Central GBrain schema + typed DB contract |
| B | `lib/brain.ts`, `lib/openclaw.ts`, `lib/truth.ts` | core brain/evidence/OpenClaw/commit helpers |
| C | `scripts/` | source ingestion, OpenClaw worker, and morning run |
| D | `lib/artifacts.ts`, `cli/` | researcher sub-GBrain sharing |
| E | `app/`, `components/` | product surfaces reading brain state |

Prefer parallel work only when lanes do not touch the same module.

## Hackathon failure modes to defend against

1. **Truth maintenance becomes abstract.** First pass must ship tables, evidence,
   claims, commits, and one working loop.
2. **Duplicate ingestion spams commits.** Use content hashes and unique indexes.
3. **LLM invents claims.** Claims need evidence citations and confidence.
4. **Morning job silently fails.** Use `ingestion_runs` status and errors.
5. **Old surfaces query raw shared artifacts only.** Migrate them to brain state.
6. **Railway cron overlap/skips hide work.** Make ingestion idempotent and visible.
7. **OpenClaw becomes hand-wavy.** Persist `openclaw_decisions` and make truth
   mutations depend on those decisions.
8. **HOG becomes just another feed.** Keep it as a first-class `hog_news` source
   so broad world/tech signal is visible in source configs and commits.

## What's already implemented (P2 web surfaces)

| File | Status | Notes |
|------|--------|-------|
| `app/layout.tsx` | ✅ Done | Helvetica Neue font, indigo/lavender theme |
| `app/page.tsx` | ✅ Done | Landing page — centered search bar, neural background |
| `app/onboard/page.tsx` | ✅ Done | Streaming Q&A UI with follow-up input |
| `app/team/page.tsx` | ✅ Done | Researcher grid with projects + matched papers |
| `app/api/onboard/route.ts` | ✅ Done | Voyage embed → pgvector search → Anthropic stream |
| `app/api/team/route.ts` | ✅ Done | Fetches researchers + shared projects + paper matches |
| `components/NeuralBackground.tsx` | ✅ Done | Animated canvas neural network |
| `components/ResearcherCard.tsx` | ✅ Done | Name, projects, matched papers with relationship badges |
| `components/PaperMatchCard.tsx` | ✅ Done | Color-coded relationship label + rationale |
| `lib/embeddings.ts` | ✅ Done | `embed()` + `embedBatch()` via Voyage voyage-3-lite |
| `lib/anthropic.ts` | ✅ Done | `streamChat()` + `judgeRelationship()` |
| `scripts/fetch-arxiv.ts` | ✅ Done | Pulls arXiv RSS, embeds, upserts to papers table |
| `scripts/seed-corpus.ts` | ✅ Done | Reads demo-data md files, embeds, inserts to Supabase |
| `scripts/match-papers.ts` | ✅ Done | pgvector top-5 + `judgeRelationship()` → paper_matches |
| `scripts/render-digest.ts` | ✅ Done | Per-researcher markdown digest from paper_matches |
| `db/match_artifacts.sql` | ✅ Done | pgvector RPC function — run once in Supabase SQL editor |

Web surfaces currently read from `artifacts` (shared tier) and `paper_matches`. As the Central GBrain layer is built, migrate `app/api/onboard/route.ts` and `app/api/team/route.ts` to read from `truth_claims` and `brain_commits` instead.

## Commands

```bash
bun install
bun run build
bun run seed-corpus
bun run brain:ingest
bun run brain:morning
bun run openclaw:worker
bun run openclaw:pending
```

`brain:ingest` and `brain:morning` may be added as part of the Central GBrain
implementation.

## Deployment

Recommended first deployment:

- Supabase for Postgres + pgvector.
- Railway web service for Next.js.
- Railway worker service for the OpenClaw head Central GBrain operator.
- Railway cron service for morning runs.

Use `LABBRAIN_WORKER_TOKEN` for secured web hooks. Use Supabase service-role
credentials only in the Railway worker/web server environment, never browser
code.

Do not split into a complex queue architecture until the single worker loop
proves the product.

## Explicitly NOT in scope for the first Central GBrain pass

- multi-lab tenancy
- Google SSO / real auth
- local PGLite sync
- revoke-share state machine
- OpenClaw inside smaller researcher GBrains
- broad connector ecosystem
- full contradiction-resolution UI
- production eval suite
- Slack/Notion/Drive/Zotero ingestion

## Skill routing

When the user's request matches an available gstack skill, invoke it via the
Skill tool. When in doubt, invoke the skill.

Key routing rules:

- Product ideas / brainstorming -> invoke `/office-hours`
- Strategy / scope -> invoke `/plan-ceo-review`
- Architecture -> invoke `/plan-eng-review`
- Design system / plan review -> invoke `/design-consultation` or `/plan-design-review`
- Full review pipeline -> invoke `/autoplan`
- Bugs / errors -> invoke `/investigate`
- QA / testing site behavior -> invoke `/qa` or `/qa-only`
- Code review / diff check -> invoke `/review`
- Visual polish -> invoke `/design-review`
- Ship / deploy / PR -> invoke `/ship` or `/land-and-deploy`
- Save progress -> invoke `/context-save`
- Resume context -> invoke `/context-restore`
