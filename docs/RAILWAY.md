# Railway Deployment Plan

LabBrain should run as three Railway services from the same GitHub repo:

1. `labbrain-web`
   - config file: `deploy/railway-web.json`
   - command: `bun run start`
   - health check: `/api/health`
2. `labbrain-openclaw-worker`
   - config file: `deploy/railway-openclaw-worker.json`
   - command: `bun run openclaw:loop`
   - purpose: continuously applies the head Central GBrain OpenClaw operator to pending evidence
3. `labbrain-morning-cron`
   - config file: `deploy/railway-morning-cron.json`
   - command: `bun run brain:morning`
   - cron: `0 13 * * *`

## Required Variables

Set these on all three Railway services unless noted:

```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
LABBRAIN_DEFAULT_BRAIN_NAME=LabBrain
LABBRAIN_DEFAULT_BRAIN_SUBJECT="research lab knowledge"
LABBRAIN_DEFAULT_BRAIN_MISSION="Maintain evidence-backed shared truth for the lab"
LABBRAIN_WORKER_TOKEN=
OPENCLAW_OPERATOR_NAME="Glab Head GBrain OpenClaw"
OPENCLAW_HEAD_GBRAIN_URL=
OPENCLAW_HEAD_GBRAIN_TOKEN=
OPENCLAW_POLL_INTERVAL_MS=60000
OPENCLAW_PENDING_LIMIT=50
LABBRAIN_ARXIV_QUERY=cat:cs.LG
LABBRAIN_RSS_FEEDS=
LABBRAIN_HOG_FEEDS=top,new
```

Also set this on the web service for browser-safe Supabase use:

```bash
SUPABASE_ANON_KEY=
```

Optional:

```bash
ANTHROPIC_API_KEY=
VOYAGE_API_KEY=
RESEND_API_KEY=
```

## Setup Steps

1. Create or select a Railway project.
2. Add a service from GitHub for `rohanb123/glab`, branch `P4An` until it lands on `main`.
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

1. Ask the repo owner to install/adjust the Railway GitHub app so Railway can access `rohanb123/glab`.
2. Deploy from a local checkout with Railway CLI after logging in.
3. Fork the repo into your GitHub account and deploy the fork.

Forking is the practical fallback when the repo owner cannot or will not grant the Railway app access. It is not the only path.
