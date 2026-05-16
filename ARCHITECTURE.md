# LabBrain — Hackathon Architecture Plan

**Status:** Plan-stage. Hackathon demo target.
**Owner:** Raghav Aggarwal (raghav_aggarwal@berkeley.edu)
**Repo:** rohanb123-glab @ main
**Generated:** 2026-05-16

---

## Product (hackathon framing)

LabBrain demos three use cases on top of a single shared knowledge base ("GTeam") that researchers contribute to from their individual indexes ("GBrain"):

1. **Onboarding** — new researcher asks "what's the lab working on?" / "who's working on diffusion models?" — gets accurate answers from the lab's full history.
2. **Staying current** — daily email digest of relevant papers with claim-level annotation (validates / suggests change / extends / scoops your work).
3. **Team visibility** — web dashboard showing what each lab member is working on without interrupting them.

**Demo target:** 3-5 simulated researchers, ~50-100 seeded shareable artifacts, real arXiv feed for a few hours, ~5-10 papers run through the matcher, one daily-digest email rendered, web dashboard live.

---

## Locked decisions

| ID | Decision | Choice | Hackathon implementation |
|----|----------|--------|--------------------------|
| D1 | v1 scope | All three use cases, thin | One web app + one CLI + one cron job. Each use case is one route or one command. |
| D2 | Individual GBrain | Reuse existing gstack GBrain (research-artifact ingestion adapter) | `gbrain` already exists — extend its ingestion to handle PDFs/text and tag rows with `tier` + `researcher_id`. |
| D3 | Privacy default | Opt-in (shared tier requires explicit flag) | One column: `tier ∈ {private, shared}`. Default `private`. Share prompt at creation. |
| D4 | Storage architecture | Local + sync — **collapsed for hackathon: single Supabase Postgres with `tier` column**. "Local" tier = rows scoped to one researcher; "shared" tier = rows visible to all in GTeam queries. | One pgvector table. No sync pipeline. |
| D3a | GTeam seeding | Seed corpus on setup + share prompts at creation time | Demo seed: scrape PI's lab webpage + paste prior pub abstracts. Share prompts = checkbox in web upload form. |
| D5 | Hosting | **Hackathon: single-node (local Postgres or one Supabase + one Fly/Vercel)**. SaaS/self-host considerations deferred entirely. | One deployment. |
| D6 | Paper-to-work matching | Hybrid: embedding prefilter → LLM relationship judge → per-researcher ranking | Stage 1: pgvector cosine top-5 per paper. Stage 2: one Anthropic API call per (paper, candidate-project) — output JSON with `relationship` + `rationale`. Stage 3: group by researcher, render markdown digest. |
| D10 | Surface area | CLI + web app + email digest | CLI = extend `gbrain`. Web = Next.js app with 3 routes (`/onboard`, `/team`, `/upload`). Email = markdown rendered + Resend (or just print to console for demo). |
| D11 | Stack | TypeScript + Bun + Next.js + Supabase | One language CLI + web + scripts; matches gbrain; minimum infra setup. |
| D11a | Embeddings | Voyage AI (voyage-3 or voyage-3-lite, 1024 dim) | Anthropic-recommended partner; first-class TS SDK; generous free tier. |

---

## High-level architecture (hackathon shape)

```
                                ┌──────────────────────────┐
                                │      arXiv API (daily)    │
                                │  (one category, ~50 papers)│
                                └────────────┬──────────────┘
                                             │
                                             ▼
                              ┌──────────────────────────────┐
                              │   Paper ingest worker (cron)  │
                              │   - fetch arXiv RSS           │
                              │   - embed abstract            │
                              │   - upsert to papers table    │
                              └─────────────┬────────────────┘
                                            │
                                            ▼
                          ┌──────────────────────────────────────┐
                          │     Matcher worker (cron, nightly)    │
                          │   for each new paper:                 │
                          │     1. top-5 projects by cosine       │
                          │     2. LLM judge per pair             │
                          │     3. insert into paper_matches      │
                          │   render per-researcher digest        │
                          └──────────────────┬───────────────────┘
                                             │
                                             ▼
                          ┌──────────────────────────────────────┐
                          │       Supabase Postgres (pgvector)    │
                          │                                       │
                          │  Tables:                              │
                          │    researchers (id, name, email)      │
                          │    artifacts (id, owner, tier, type,  │
                          │               content, embedding,     │
                          │               created_at)             │
                          │       tier ∈ {private, shared}        │
                          │       type ∈ {project, paper_ref,     │
                          │               note, finding, ...}     │
                          │    papers (id, arxiv_id, title,       │
                          │            abstract, embedding,       │
                          │            authors, published_at)     │
                          │    paper_matches (paper_id,           │
                          │                   project_artifact_id,│
                          │                   relationship,       │
                          │                   rationale,          │
                          │                   confidence)         │
                          └──────────────────┬───────────────────┘
                                             │
              ┌──────────────────────────────┼────────────────────────┐
              │                              │                        │
              ▼                              ▼                        ▼
   ┌──────────────────┐         ┌─────────────────────┐    ┌─────────────────────┐
   │   gbrain CLI      │         │   Next.js web app    │    │  Daily email digest  │
   │                   │         │                      │    │                      │
   │  - ingest <file>  │         │  /upload (artifact)  │    │  per-researcher MD   │
   │  - share <id>     │         │  /onboard (Q&A chat) │    │  rendered + sent     │
   │  - search <q>     │         │  /team   (dashboard) │    │  (or printed for     │
   │                   │         │                      │    │   demo)              │
   └──────────────────┘         └─────────────────────┘    └─────────────────────┘
```

---

## Demo-day script (what gets shown)

| Beat | Surface | Action | Expected output |
|------|---------|--------|-----------------|
| 1 | CLI (or web upload) | Pre-demo: seed 3 researchers, each with 2-3 project descriptions tagged `shared`. Add lab-wide PI pubs as `shared`. | DB has ~10-15 shared artifacts before demo starts. |
| 2 | Web `/onboard` | New postdoc asks "What's the lab working on?" — vector search + LLM summarize | Coherent answer naming each researcher's current focus, citing project artifacts. |
| 3 | Web `/onboard` | "Who's working on diffusion models?" | Names one specific researcher with their project, plus a related paper from the matched feed. |
| 4 | Web `/team` | Show dashboard | Per-researcher cards: name, current projects, latest matched papers. |
| 5 | Email digest | Open prerendered digest for "Alice" | 3-5 papers, each labeled `validates Alice's Project X because [rationale]` or `scoops Alice's approach in Project Y because [rationale]`. |
| 6 | Web upload + share | Live: add a new artifact, check the "share with lab" box | Appears in `/team` immediately. |

If all six beats land in 5 minutes, the demo works.

---

## Build order — concrete steps (assuming ~24-36 working hours)

### Hour 0-2: scaffold and infra
- `bun create next-app labbrain-web`
- Provision Supabase project, enable pgvector extension
- Schema: `researchers`, `artifacts`, `papers`, `paper_matches` (SQL in `db/schema.sql`)
- Seed 3 researcher rows
- Confirm gbrain installed and pointing at the same Supabase

### Hour 2-6: ingestion path (one end-to-end slice)
- Web route `/upload`: form takes (type, content, tier checkbox), calls Anthropic embeddings, upserts to `artifacts`
- CLI: `gbrain` already supports ingest — add a thin wrapper that sets `owner_id` + `tier`
- Verify: upload via web, see row in Supabase, pgvector embedding populated

### Hour 6-12: onboarding query (use case #1)
- Web route `/onboard`: text input → vector search over `artifacts WHERE tier='shared'` → top-10 → Anthropic claim-level summary
- Streaming response (Anthropic SDK streaming) — feels alive in demo
- Cache last 5 queries to avoid demo-day rate limits

### Hour 12-18: paper pipeline (use case #2, half)
- `scripts/fetch-arxiv.ts`: pull arXiv RSS for one category (e.g., `cs.LG`), embed abstracts, upsert to `papers`
- `scripts/match-papers.ts`: for each new paper, top-5 candidate projects by cosine, then one Anthropic call per pair with JSON output schema `{relationship, rationale, confidence}`; upsert to `paper_matches`
- Run once, manually, before demo. Don't bother with cron.

### Hour 18-22: email digest + team view (use case #2 finish + #3)
- `scripts/render-digest.ts`: for each researcher, query `paper_matches` joined to `papers`, render markdown. Print to console OR send via Resend.
- Web route `/team`: SSR list of researchers, each card showing current projects + latest matched papers
- Polish: page layout, basic styling, no auth (hardcode current user in a cookie or query param)

### Hour 22-26: seed corpus + share prompts
- One-time seed script: scrape a few PI lab pages (use simple HTML fetch, regex-extract abstracts) and seed as shareable artifacts
- Upload form: smart default for `tier` checkbox based on artifact type (project description → checked; raw note → unchecked)

### Hour 26-30: demo polish
- End-to-end dry run of the 6-beat demo script
- Pre-render the email digest as an HTML page that can be projected
- Smoke-test rate limits with intentional slow-down between Anthropic calls
- Backup: if Anthropic API hiccups, have a "cached digest" path

### Hour 30+: buffer / stretch
- Slack integration (if extra time): post digest to a channel — 1-2 hours
- Multi-category arXiv (`cs.LG` + `cs.CL`): 30 min
- Better seed: ingest one full lab wiki via web scrape: 2-3 hours

---

## NOT in scope (hackathon)

- **Sync pipeline.** Collapsed to one DB. No conflict handling, no revoke-share, no edits-after-share state machine.
- **Real auth.** Hardcoded demo users. No Google SSO, no RLS, no roles, no multi-lab.
- **Slack / IDE / browser ext.** Not in v1.
- **Self-host.** Single-node demo only.
- **Ingestion adapters for Slack/Notion/Drive/Zotero.** OAuth integrations are days of work; defer.
- **Eval suite for the matcher.** Test it manually with curated examples; production eval suite is a v2 problem.
- **Cost budgeting via batch API.** Demo volumes are tiny; pay the real-time premium.
- **Robust error handling.** Catch errors with sentry-style toast; nothing fancy.
- **Test coverage.** A few smoke tests for the matcher prompt; no broad coverage push.
- **Performance optimization.** Page load times don't matter at demo scale.
- **TODOS.md.** Capture follow-ups inline in this file under a "v2 ideas" section if needed.

---

## What already exists (reuse)

| Need | Existing primitive | Hackathon use |
|------|-------------------|----------------|
| Vector store, embeddings, MCP | gstack GBrain + pgvector | Backing store; CLI ingest |
| Paper metadata | arXiv API (RSS, JSON) | Daily pull, one category for demo |
| Paper enrichment | Semantic Scholar API (TLDRs) | Skip for hackathon; abstract is enough |
| Embeddings | Anthropic / OpenAI / Voyage | Pick one, probably whichever has best free tier |
| LLM judge | Anthropic API | Real-time, no batching |
| Web framework | Next.js + Bun + Tailwind | Standard hackathon stack |
| DB | Supabase (Postgres + pgvector) | One project, free tier |
| Email | Resend or just markdown-to-console | Resend if time, console-print otherwise |
| Auth | (skipped — hardcode user) | N/A |

---

## Data model (hackathon-grade)

```sql
-- Researchers in the demo lab
create table researchers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null unique,
  created_at  timestamptz default now()
);

-- All researcher artifacts: projects, notes, paper_refs, findings, hypotheses
create table artifacts (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references researchers(id),
  type        text not null,                 -- 'project' | 'note' | 'paper_ref' | 'finding' | 'hypothesis'
  tier        text not null default 'private', -- 'private' | 'shared'
  title       text,
  content     text not null,
  embedding   vector(1024),                  -- Voyage voyage-3 / voyage-3-lite
  created_at  timestamptz default now()
);

create index on artifacts using hnsw (embedding vector_cosine_ops);
create index on artifacts (tier, owner_id);

-- Papers pulled from arXiv
create table papers (
  id            uuid primary key default gen_random_uuid(),
  arxiv_id      text unique,
  title         text not null,
  abstract      text not null,
  authors       text[],
  published_at  timestamptz,
  embedding     vector(1024),
  ingested_at   timestamptz default now()
);

create index on papers using hnsw (embedding vector_cosine_ops);

-- Paper-to-project relationship judgments
create table paper_matches (
  id                 uuid primary key default gen_random_uuid(),
  paper_id           uuid references papers(id),
  project_artifact_id uuid references artifacts(id),
  researcher_id      uuid references researchers(id),
  relationship       text,    -- 'validates' | 'suggests_change' | 'extends' | 'scoops' | 'orthogonal'
  rationale          text,    -- 1-2 sentence LLM-generated explanation
  confidence         float,
  created_at         timestamptz default now()
);

create index on paper_matches (researcher_id, created_at desc);
```

---

## Key prompts (the magic moment)

### Onboarding query (Q&A over shared artifacts)

```
You are a research-lab knowledge assistant. The user asks a question about the lab.
Below are the most relevant lab artifacts (project descriptions, notes, papers,
findings). Cite specific artifacts by ID when answering. If the artifacts don't
contain the answer, say so — don't invent.

QUESTION: {user_question}

ARTIFACTS:
{top_k_retrieved_artifacts_with_ids}

Answer concisely. Cite [artifact:id] inline.
```

### Paper-to-project relationship judge (the killer feature)

```
You are evaluating whether a new research paper is relevant to an active project,
and HOW. Output JSON with this shape:

{
  "relationship": "validates" | "suggests_change" | "extends" | "scoops" | "orthogonal",
  "rationale": "<1-2 sentence specific explanation>",
  "confidence": <0.0 to 1.0>
}

Definitions:
- validates: paper's findings support the project's hypothesis or methodology
- suggests_change: paper suggests a methodological or directional pivot
- extends: paper builds on the project's space; useful to read and cite
- scoops: paper appears to have done something very similar to the project's goal
- orthogonal: papers shares vocabulary but not substance; skip

PAPER:
Title: {paper.title}
Abstract: {paper.abstract}

PROJECT:
{project.title}
{project.content}

Latest findings/notes attached to project:
{recent_shared_artifacts_for_project}

Be specific in the rationale. Quote phrases. If unsure, lower confidence — do not
default to "orthogonal".
```

---

## Critical risks (hackathon-specific)

1. **Anthropic / OpenAI rate limit during demo.** Mitigate with a pre-rendered digest cached to disk; live calls only for the onboarding Q&A streaming. (Confidence: 9/10 this will bite if not addressed.)
2. **pgvector dimension mismatch.** Decide on embedding model in hour 0 and stick with it. Migrating dimensions mid-demo is painful. (Confidence: 8/10.)
3. **arXiv API empty for demo category.** Pre-cache 2-3 days of papers locally so the demo doesn't depend on arXiv freshness on demo day. (Confidence: 6/10 — arXiv is reliable but Murphy's law.)
4. **LLM judge inconsistency.** The relationship taxonomy ({validates, suggests_change, extends, scoops, orthogonal}) is the demo's punchline — if it returns nonsense, the demo flops. Manually curate 5 (paper, project) test pairs and check the output before demo. (Confidence: 9/10 this matters.)
5. **Onboarding query returns nothing useful.** Caused by sparse GTeam — mitigate by seeding ~30-50 shared artifacts before demo, not 3-5. (Confidence: 10/10 — guaranteed to bite without prep.)

---

## Completion Summary

| Check | Result |
|-------|--------|
| Step 0 — Scope challenge | Triggered; user accepted broad-scope (D1=A, all three thin). Re-collapsed for hackathon constraints. |
| Architecture review | 9 decisions captured (D1, D2, D3, D3a, D4, D5, D6, D10, D11, D11a). 0 unresolved. |
| Code quality review | N/A — greenfield repo (LICENSE + README only). Re-run `/plan-eng-review` on actual diff before shipping. |
| Test review | Hackathon-tier: smoke-test the matcher prompt on 5 curated (paper, project) pairs before demo. No production eval suite in scope. |
| Performance review | Demo-scale only. ~50-100 artifacts, ~5-10 papers through matcher. No optimization needed. |
| NOT in scope | Written (sync pipeline, real auth, Slack/Notion/Drive adapters, self-host, eval suite, broad test coverage, perf optimization). |
| What already exists | Written (gstack GBrain, arXiv API, Voyage embeddings, Anthropic LLM, Supabase). |
| Outside voice | Skipped (hackathon time constraint). |
| Parallelization | Sequential build, single builder. No parallelization analysis. |
| Failure modes | 5 hackathon-specific risks flagged with confidence scores. |
| Critical gaps | 1 (matcher prompt quality — must hand-test before demo or feature flops). |
| Unresolved decisions | None. |

## v2 ideas (post-hackathon, if it lands)

- Real sync pipeline (when D4 is honored — local PGLite + cloud GTeam, conflict resolution, revoke-share)
- Real auth: Google SSO + lab membership + roles
- Slack / Notion / Drive / Zotero ingestion adapters (each is a 1-2 day OAuth project)
- Anthropic batch API for matcher cost reduction at scale
- Eval suite for matcher: curated paper/project pairs with gold labels, regression on every prompt change
- Self-host story: containerize core, env-config everything, document deploy
- Multi-lab + cross-lab collaboration model

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run (hackathon — strategy is "ship the demo") |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | skipped (hackathon time) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 9 decisions captured, 0 unresolved, 1 critical gap flagged (matcher prompt quality) |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | not run (3 simple Next.js routes, no design system needed for hackathon) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | n/a (no API/SDK shipped in v1) |

**UNRESOLVED:** 0 decisions
**VERDICT:** ENG CLEARED — hackathon plan ready to build. Suggested next step: `/ship` after first end-to-end slice (hour 2-6 milestone in build order).
