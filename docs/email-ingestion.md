# Email Ingestion — Feature Spec

## What this does

Researchers can email `.md` files to a monitored Gmail address and they are automatically ingested into LabBrain's central Supabase database as artifacts. No CLI, no upload form — just send an email from your phone or desktop and the knowledge lands in the brain.

**Monitored inbox:** `drewmanley16@gmail.com`

---

## User flow

1. Researcher writes a note, finding, or hypothesis as a `.md` file (or pastes markdown in the email body)
2. Sends it to `drewmanley16@gmail.com` with subject like `[alice] experiment findings session 24`
3. The ingestor picks it up, identifies the researcher from the subject tag, and upserts into Supabase as a new artifact
4. The artifact is immediately searchable from `/onboard` and visible on `/team`

---

## Technical approach

### Gmail polling via Composio

A script (`scripts/ingest-email.ts`) polls the Gmail inbox every N minutes through the Composio CLI. The always-on OpenClaw Railway worker (`awake-purpose`) also calls the same ingestion code inside `scripts/openclaw-loop.ts`, so one worker both watches email and applies OpenClaw decisions to new evidence.

**Why Composio CLI polling over direct Gmail OAuth:** the monitored Gmail account is already connected in Composio, so the worker can call Gmail tools without storing Google OAuth client secrets in this repo.

**Flow:**

```
Gmail inbox (drewmanley16@gmail.com)
  → Composio Gmail fetch for unread researcher-tagged messages
  → for each new email:
      1. parse researcher ID from subject tag e.g. [alice]
      2. download .md attachment(s) OR use email body as content
      3. extract title from filename or subject line
      4. insert through lib/artifacts.ts as a researcher artifact
      5. if shared, create Central GBrain evidence and OpenClaw decision immediately
      6. mark email as read after successful ingestion
```

### Supabase mapping

| Email field | Artifact field |
|-------------|---------------|
| Subject (after tag) | `title` |
| `.md` attachment content / body | `content` |
| Researcher tag in subject `[alice]` | `owner_id` (lookup by name) |
| Default | `type: 'note'`, `tier: 'shared'` |

For the demo, email to the monitored lab inbox is treated as explicit sharing into the Central GBrain by default. To force private storage, include `[private]` in the subject. To be explicit about sharing, include `[shared]`:
```
Subject: [alice][shared] my findings on hyperalignment v2
```

---

## Implementation

### New file: `scripts/ingest-email.ts`

Owned by P1/P4. Needs:

```typescript
// Key integration
import { runEmailIngestion } from '@/lib/email-ingestion'

// Steps:
// 1. Ensure Composio CLI is installed and logged in
// 2. Fetch unread Gmail messages matching researcher tags
// 3. Decode .md attachment(s), or use email body markdown
// 4. Lookup researcher by subject tag or sender email
// 5. Insert via createArtifact()
// 6. Mark message read after successful ingestion
```

Add to `package.json`:
```json
"email:ingest": "bun scripts/ingest-email.ts"
```

### New env vars (add to `.env.example`)

```
# Composio Gmail ingestion
EMAIL_INGEST_ENABLED=true
EMAIL_INGEST_MONITORED_ADDRESS=drewmanley16@gmail.com
EMAIL_INGEST_DEFAULT_TIER=shared
EMAIL_INGEST_MAX_MESSAGES=25
EMAIL_INGEST_MARK_READ=true
COMPOSIO_USER_API_KEY=
COMPOSIO_ORG=drewmanley16_workspace
```

---

## Running it

**One-shot (manual trigger):**
```bash
bun run email:ingest
```

**Production / demo setup:**
```bash
# awake-purpose runs this continuously:
bun run openclaw:loop
```

---

## Demo use case

For the demo, send a `.md` file to the inbox live on stage:

1. Open phone → Gmail → compose
2. Attach a `.md` file (e.g. `experiment-findings.md`)
3. Subject: `[alice] new visual cortex findings`
4. Send
5. Run `bun run email:ingest` in terminal, or wait for `awake-purpose`
6. Refresh `/team` — Alice's new artifact appears instantly

This makes the "living brain" aspect visceral — the audience watches knowledge flow in real time.

---

## Open questions

- [x] Do we run this as a Vercel cron route (`app/api/ingest-email/route.ts`) or a standalone script? Standalone script inside the Railway worker.
- [x] Should the email body itself be ingested if no `.md` attachment is present? Yes, if the subject maps to a researcher.
- [x] Who sets up Gmail credentials? Composio owns Gmail auth; Railway only needs the Composio user API key and org.
- [ ] Do we want a dedicated Gmail label after ingestion, or is removing `UNREAD` enough for the demo?
