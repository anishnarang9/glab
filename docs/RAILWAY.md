# Railway Deployment Plan

LabBrain should run as three Railway services from the same GitHub repo.
Current production service names:

1. `efficient-motivation`
   - config file: `deploy/railway-web.json`
   - command: `bun run start`
   - health check: `/api/health`
2. `awake-purpose`
   - config file: `deploy/railway-openclaw-worker.json`
   - command: `bun run brain:worker`
   - purpose: watches Supabase for shared artifacts from smaller GBrains, turns them into Central GBrain evidence, and continuously applies the head OpenClaw operator
3. `diplomatic-creation`
   - config file: `deploy/railway-morning-cron.json`
   - command: `bun run brain:nightly`
   - cron: `30 0 * * *` (00:30 UTC / about 5:30 PM Pacific during PDT)

## Required Variables

Set these on all three Railway services unless noted:

```bash
DATABASE_URL=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
LABBRAIN_DEFAULT_BRAIN_NAME=LabBrain
LABBRAIN_DEFAULT_BRAIN_SUBJECT="research lab knowledge"
LABBRAIN_DEFAULT_BRAIN_MISSION="Maintain evidence-backed shared truth for the lab"
LABBRAIN_WORKER_TOKEN=
OPENCLAW_OPERATOR_NAME="Glab Head GBrain OpenClaw"
OPENCLAW_REMOTE_REQUIRED=false
OPENCLAW_POLL_INTERVAL_MS=60000
OPENCLAW_PENDING_LIMIT=50
SUPABASE_SHARED_INGEST_ENABLED=true
SHARED_ARTIFACT_INGEST_LIMIT=500
LABBRAIN_ARXIV_QUERY=cat:cs.LG
LABBRAIN_ARXIV_QUERIES=
LABBRAIN_RSS_FEEDS=
LABBRAIN_WEB_SOURCES=
LABBRAIN_USE_CURATED_WEB_SOURCES=true
LABBRAIN_HOG_FEEDS=top,new
HOG_ACCESS_KEY=
HOG_SECRET_KEY=
HOG_BASE_URL=https://developer.thehog.ai
```

For the current P4 deploy, `DATABASE_URL` should be the Supabase pooler
Postgres URI. The server code uses it before Supabase REST, so the web service,
morning cron, and OpenClaw worker still run if the Supabase REST API keys are
not valid.

Also set this on the web service for browser-safe Supabase use:

```bash
SUPABASE_ANON_KEY=
```

Optional:

```bash
ANTHROPIC_API_KEY=
VOYAGE_API_KEY=
OPENCLAW_HEAD_GBRAIN_URL=
OPENCLAW_HEAD_GBRAIN_TOKEN=
EMAIL_INGEST_ENABLED=false
EMAIL_INGEST_MONITORED_ADDRESS=
EMAIL_INGEST_DEFAULT_TIER=shared
EMAIL_INGEST_MAX_MESSAGES=100
EMAIL_INGEST_MARK_READ=true
COMPOSIO_USER_API_KEY=
COMPOSIO_ORG=
```

For P4, `awake-purpose` is the Railway OpenClaw worker service. Do not block
deployment on `OPENCLAW_HEAD_GBRAIN_URL`; that variable only swaps the local
Railway OpenClaw decision policy for a richer remote decision endpoint later.
If the remote endpoint is configured but unavailable, the worker records
`decision_mode='local_openclaw_fallback'` in the decision payload unless
`OPENCLAW_REMOTE_REQUIRED=true`.

The `awake-purpose` worker is Supabase-first. Smaller researcher GBrains write
rows directly into `artifacts` with `tier='shared'`; the worker adopts rows whose
`brain_id` is either null or the head brain id, creates `evidence_items`, runs
OpenClaw, writes `truth_claims`/`truth_revisions` as needed, and records
`brain_commits`. Gmail ingestion is optional and should stay disabled unless the
demo specifically needs the mailbox path.

## Setup Steps

1. Create or select a Railway project.
2. Add a service from GitHub for `anishnarang9/glab`, branch `P4An` until it lands on `main`.
3. Point the service config file to `deploy/railway-web.json`.
4. Add a second service from the same repo and branch, with config file `deploy/railway-openclaw-worker.json`.
5. Add a third service from the same repo and branch, with config file `deploy/railway-morning-cron.json`.
6. Add the environment variables above.
7. Run the SQL in `db/schema.sql`, then `db/seed.sql`, against Supabase.
8. Verify `/api/health` returns `{ "ok": true }`.
9. Insert a shared artifact directly into Supabase or run `brain:nightly`, then confirm rows appear in:
   - `artifacts` with `tier='shared'`
   - `ingestion_runs`
   - `evidence_items`
   - `openclaw_instances`
   - `openclaw_decisions`
   - `truth_claims`
   - `brain_commits`

## Verification

Run the non-live suite before deploying:

```bash
bun run ci
```

Run the live production smoke only when you intend to create and clean up a
temporary marked artifact in Supabase:

```bash
P4_E2E_PROD=true bun run verify:e2e:prod
```

To prove the always-on Railway worker is the component ingesting the row, add:

```bash
P4_E2E_PROD=true P4_E2E_USE_WORKER=true bun run verify:e2e:prod
```

## If the GitHub Repo Does Not Show Up

Use this order:

1. Use the fork now created at `anishnarang9/glab`.
2. If the fork still does not show, configure the Railway GitHub app for your GitHub account and include the fork.
3. Deploy from a local checkout with Railway CLI after logging in.
4. Ask the upstream repo owner to install/adjust the Railway GitHub app so Railway can access `rohanb123/glab`.

Forking is the practical fallback when the upstream repo owner cannot or will not
grant the Railway app access. It is not the only path.
