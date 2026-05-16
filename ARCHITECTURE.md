# LabBrain - Central GBrain Architecture

**Status:** Architecture reset. Prior "shared rows in Supabase" plan is superseded.
**Repo:** rohanb123-glab
**Updated:** 2026-05-16

---

## Product thesis

LabBrain is not a shared database. LabBrain is a **Central GBrain** for a lab,
research domain, or topic.

The Central GBrain is a persistent brain entity. It reads new research, accepts
shared updates from individual researcher GBrains, maintains an evidence-backed
truth state, and emits mini git-like commits whenever its understanding changes.

Supabase is the memory store. The Central GBrain is the product.

```
                         live external sources
                    arXiv / RSS / news / web pages
                                  |
                                  v
Researcher GBrains -----> Central GBrain -----> onboarding answers
 shared artifacts             |                 team dashboard
 project updates              |                 daily digest
 notes/findings               v                 urgent alerts
                       truth graph + commits
```

## Why the previous plan was wrong

The old plan treated `artifacts.tier = 'shared'` as the central shared truth.
That is only storage. It does not explain:

- what the brain currently believes
- why it believes that
- which new evidence changed the belief
- how contradictory evidence is preserved
- how a mid-day researcher update becomes part of the shared research state
- how the system can show a history of "what changed"

The revised plan makes `shared` researcher artifacts one input into the Central
GBrain, not the Central GBrain itself.

```
OLD:
  shared artifact rows == central truth

NEW:
  shared artifact rows -> evidence items -> truth maintenance -> brain commits
```

## Core concepts

### Brain

A `brain` is the central entity. It has a name, subject, mission, and active
status. For the hackathon this can be one default brain, but the schema should
support more.

### Source

A `brain_source` tells the brain where to learn from. Sources include:

- `arxiv_query`
- `rss_feed`
- `web_page`
- `researcher_shared_artifacts`
- `manual_upload`

### Evidence

An `evidence_item` is raw incoming knowledge. It can be a paper abstract, news
item, lab webpage excerpt, researcher note, project update, or finding.

Evidence is immutable enough to cite. If the source changes, we create a new
evidence item or an updated commit, not a silent overwrite.

### Truth claim

A `truth_claim` is the brain's current belief about the research domain.

Examples:

- "Diffusion models are currently the strongest candidate for low-dose
  microscopy reconstruction in this lab's project set."
- "Closed-loop wet-lab planning papers are directly relevant to Ben's protein
  stability screen."
- "A new paper may scoop Alice's next milestone because it uses the same method
  and target benchmark."

Claims are not just answers. They are maintained state with evidence, confidence,
and revision history.

### Brain commit

A `brain_commit` is the product's mini git push.

Every meaningful update creates a commit:

- new evidence arrived
- claim created
- claim strengthened
- claim weakened
- claim contradicted
- claim refined
- researcher relevance changed

Commits make the brain legible. Users can ask, "what did the brain learn today?"
and get a real answer.

## Truth maintenance loop

The truth loop runs whenever new data arrives. Morning cron is one trigger.
Mid-day researcher sharing is another trigger.

```
new data arrives
      |
      v
normalize + dedupe
      |
      v
store evidence item
      |
      v
extract candidate claims
      |
      v
compare against current truth_claims
      |
      +--> supports existing claim
      +--> contradicts existing claim
      +--> refines existing claim
      +--> creates new claim
      |
      v
write brain_commit + commit changes
      |
      v
update dashboard / digest / researcher relevance
```

Key rule: **new data never silently overwrites truth.** It produces a commit with
provenance and rationale.

## Two update modes

### Morning run

The morning run refreshes the brain's shared truth about the whole subject.

```
Railway cron service
      |
      v
fetch enabled sources
      |
      v
run Central GBrain truth loop
      |
      v
render digest + update dashboard state
```

This run is broad. It checks arXiv, RSS/news, configured web pages, and any
source whose cadence says it should be refreshed.

### Mid-day commit

The brain also updates during the day.

```
researcher shares from sub-GBrain
      |
      v
shared artifact event
      |
      v
evidence item
      |
      v
truth loop
      |
      v
brain_commit
```

The user-facing feeling should be: "the lab brain just learned something."

## Data model

P1 has already merged the base schema:

- `researchers`
- `artifacts`
- `papers`
- `paper_matches`

Those remain useful, but their meaning changes.

| Table | New role |
|-------|----------|
| `researchers` | identities for people whose sub-GBrains contribute to the central brain |
| `artifacts` | researcher-owned input data; `tier='shared'` feeds the Central GBrain |
| `papers` | raw external paper records; can become evidence items |
| `paper_matches` | researcher-facing relevance view; can be derived from truth/evidence edges |

Add these tables:

```sql
brains (
  id uuid primary key,
  name text not null,
  subject text not null,
  mission text,
  status text not null,
  created_at timestamptz
)

brain_sources (
  id uuid primary key,
  brain_id uuid references brains(id),
  kind text not null,
  label text not null,
  config jsonb not null,
  cadence text not null,
  enabled boolean not null,
  last_checked_at timestamptz,
  created_at timestamptz
)

ingestion_runs (
  id uuid primary key,
  brain_id uuid references brains(id),
  source_id uuid references brain_sources(id),
  trigger text not null,
  status text not null,
  started_at timestamptz,
  finished_at timestamptz,
  error text
)

evidence_items (
  id uuid primary key,
  brain_id uuid references brains(id),
  source_id uuid references brain_sources(id),
  ingestion_run_id uuid references ingestion_runs(id),
  artifact_id uuid references artifacts(id),
  paper_id uuid references papers(id),
  source_kind text not null,
  source_ref text,
  title text,
  content text not null,
  url text,
  published_at timestamptz,
  embedding vector(1024),
  content_hash text not null,
  created_at timestamptz
)

truth_claims (
  id uuid primary key,
  brain_id uuid references brains(id),
  statement text not null,
  status text not null,
  confidence float,
  current_revision_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)

truth_revisions (
  id uuid primary key,
  claim_id uuid references truth_claims(id),
  commit_id uuid references brain_commits(id),
  statement text not null,
  confidence float,
  rationale text,
  created_at timestamptz
)

truth_evidence_edges (
  id uuid primary key,
  claim_id uuid references truth_claims(id),
  evidence_id uuid references evidence_items(id),
  relationship text not null,
  rationale text,
  confidence float,
  created_at timestamptz
)

brain_commits (
  id uuid primary key,
  brain_id uuid references brains(id),
  parent_commit_id uuid references brain_commits(id),
  ingestion_run_id uuid references ingestion_runs(id),
  kind text not null,
  summary text not null,
  commit_hash text not null,
  created_at timestamptz
)

brain_commit_changes (
  id uuid primary key,
  commit_id uuid references brain_commits(id),
  entity_type text not null,
  entity_id uuid not null,
  change_type text not null,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz
)
```

## Commit semantics

Commit types:

- `source_ingested`
- `evidence_added`
- `claim_created`
- `claim_supported`
- `claim_weakened`
- `claim_contradicted`
- `claim_refined`
- `researcher_relevance_changed`
- `digest_rendered`

Evidence relationships:

- `supports`
- `contradicts`
- `refines`
- `duplicates`
- `background`
- `orthogonal`

Claim statuses:

- `active`
- `contested`
- `superseded`
- `retracted`

## Product surfaces

### Onboarding

Onboarding answers should query the Central GBrain's truth claims and supporting
evidence, not only raw shared artifacts.

```
question
  |
  v
retrieve relevant truth_claims + evidence_items
  |
  v
LLM answer with claim/evidence citations
```

### Staying current

Daily digest should be built from brain commits:

- "what changed since yesterday"
- "which claims gained evidence"
- "which claims are now contested"
- "which researcher projects are affected"

### Team visibility

Dashboard should show:

- active researchers
- current projects
- latest relevant brain commits
- contested/new claims that matter to the team

## Hosting

Recommended hackathon deployment:

- Supabase: Postgres + pgvector
- Railway web service: Next.js app
- Railway worker service: ad hoc ingestion/truth loop
- Railway cron service: morning Central GBrain update

Railway cron jobs run a command on schedule and are expected to exit. If a
scheduled run overlaps, Railway skips the new run. The implementation must use
`ingestion_runs` status plus source-level locking/deduping so skipped or failed
runs are visible.

## Implementation lanes

### Lane A - Central schema and types

Files:

- `db/schema.sql`
- `db/seed.sql`
- `db/client.ts`

Tasks:

- add Central GBrain tables
- add seed default brain and sources
- update typed database interfaces

### Lane B - Brain core library

Files:

- `lib/brain.ts`
- `lib/truth.ts`

Tasks:

- create/get default brain
- create ingestion runs
- create evidence items
- create brain commits
- link evidence to claims

### Lane C - Source ingestion

Files:

- `scripts/fetch-arxiv.ts`
- `scripts/ingest-brain.ts`
- `scripts/seed-corpus.ts`

Tasks:

- ingest arXiv/news/web/manual inputs into evidence items
- dedupe by content hash
- trigger truth loop

### Lane D - Researcher sub-GBrain sharing

Files:

- `lib/artifacts.ts`
- `cli/gbrain-research.ts`
- `cli/share.ts`

Tasks:

- private artifacts remain researcher-owned
- shared artifacts become evidence for the Central GBrain
- sharing creates a brain commit

### Lane E - Product surfaces

Files:

- `app/onboard/*`
- `app/team/*`
- `scripts/render-digest.ts`
- `scripts/send-digest.ts`

Tasks:

- read from truth claims, evidence, and commits
- render "what changed" from brain commits

## Build order

1. Add schema/types for Central GBrain.
2. Add default brain seed.
3. Add brain core functions for evidence and commits.
4. Wire researcher shared artifacts into evidence.
5. Wire arXiv/paper ingestion into evidence.
6. Add minimal truth loop:
   - first pass can create/refine claims with simple LLM output
   - must still write commits and evidence edges
7. Update dashboard/digest/onboarding to read from brain state.
8. Add Railway commands for web, worker, and cron.

## Test plan

Minimum tests/checks before demo:

- schema applies cleanly in Supabase
- default brain seed creates one active brain
- same source item ingested twice creates one evidence item
- shared researcher artifact creates evidence item and brain commit
- morning ingestion creates an `ingestion_run`
- failed source fetch records `ingestion_runs.error`
- truth loop never overwrites a claim without a revision and commit
- digest can render from brain commits without live LLM calls

## NOT in scope for first Central GBrain pass

- multi-lab tenancy
- Google auth / SSO
- local PGLite sync
- revoke-share semantics
- full contradiction resolution UI
- broad news source ranking
- production eval suite
- Slack/Notion/Drive/Zotero connectors

## Current risks

1. **Truth maintenance can become too abstract.** First pass must store evidence,
   claims, and commits. Do not try to solve epistemology in one branch.
2. **LLM output can invent claims.** Every claim must cite evidence items.
3. **Duplicate ingestion can spam commits.** Dedupe by content hash before writing.
4. **Morning cron can silently fail.** `ingestion_runs` must capture status/error.
5. **Old product surfaces may keep querying raw artifacts.** Onboarding/digest/team
   should migrate toward Central GBrain state.

## Review status

The previous plan-eng review was for the superseded "shared rows as GTeam" plan.
It should be treated as stale. A fresh engineering review should be run after the
Central GBrain schema and core loop are implemented.
