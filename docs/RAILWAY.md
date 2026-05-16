# Railway Deployment Plan

LabBrain should run as three Railway services from the same GitHub repo.
Current production service names:

1. `efficient-motivation`
   - config file: `deploy/railway-web.json`
   - command: `bun run start`
   - health check: `/api/health`
2. `awake-purpose`
   - config file: `deploy/railway-openclaw-worker.json`
   - command: `bun run openclaw:loop`
   - purpose: continuously applies the head Central GBrain OpenClaw operator to pending evidence
3. `diplomatic-creation`
   - config file: `deploy/railway-morning-cron.json`
   - command: `bun run brain:morning`
   - cron: `0 13 * * *`

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
OPENCLAW_POLL_INTERVAL_MS=60000
OPENCLAW_PENDING_LIMIT=50
LABBRAIN_ARXIV_QUERY=cat:cs.LG
LABBRAIN_RSS_FEEDS=
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
```

For P4, `awake-purpose` is the Railway OpenClaw worker service. Do not block
deployment on `OPENCLAW_HEAD_GBRAIN_URL`; that variable only swaps the local
Railway OpenClaw decision policy for a richer remote decision endpoint later.

## Setup Steps

1. Create or select a Railway project.
2. Add a service from GitHub for `anishnarang9/glab`, branch `P4An` until it lands on `main`.
3. Point the service config file to `deploy/railway-web.json`.
4. Add a second service from the same repo and branch, with config file `deploy/railway-openclaw-worker.json`.
5. Add a third service from the same repo and branch, with config file `deploy/railway-morning-cron.json`.
6. Add the environment variables above.
7. Run the SQL in `db/schema.sql`, then `db/seed.sql`, against Supabase.
8. Verify `/api/health` returns `{ "ok": true }`.
9. Trigger `openclaw:pending` or `brain:morning` once and confirm rows appear in:
   - `ingestion_runs`
   - `openclaw_instances`
   - `openclaw_decisions`
   - `brain_commits`

## If the GitHub Repo Does Not Show Up

Use this order:

1. Use the fork now created at `anishnarang9/glab`.
2. If the fork still does not show, configure the Railway GitHub app for your GitHub account and include the fork.
3. Deploy from a local checkout with Railway CLI after logging in.
4. Ask the upstream repo owner to install/adjust the Railway GitHub app so Railway can access `rohanb123/glab`.

Forking is the practical fallback when the upstream repo owner cannot or will not
grant the Railway app access. It is not the only path.
