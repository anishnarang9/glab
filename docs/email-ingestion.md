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

### Gmail polling via Gmail API

A script (`scripts/ingest-email.ts`) polls the Gmail inbox every N minutes using the Gmail API with OAuth2 service account credentials.

**Why polling over webhooks:** simpler for hackathon scope — no public webhook URL required, no Pub/Sub setup.

**Flow:**

```
Gmail inbox (drewmanley16@gmail.com)
  → poll for unread emails with .md attachments or markdown body
  → for each new email:
      1. parse researcher ID from subject tag e.g. [alice]
      2. download .md attachment(s) OR use email body as content
      3. extract title from filename or subject line
      4. insert into artifacts table (tier: 'private' by default)
      5. mark email as read / label it "ingested"
```

### Supabase mapping

| Email field | Artifact field |
|-------------|---------------|
| Subject (after tag) | `title` |
| `.md` attachment content / body | `content` |
| Researcher tag in subject `[alice]` | `owner_id` (lookup by name) |
| Default | `type: 'note'`, `tier: 'private'` |

To make an artifact shared with the lab, researcher includes `[shared]` in the subject:
```
Subject: [alice][shared] my findings on hyperalignment v2
```

---

## Implementation

### New file: `scripts/ingest-email.ts`

Owned by P1/P4. Needs:

```typescript
// Key dependencies
import { google } from 'googleapis'          // Gmail API
import { supabaseAdmin } from '@/lib/supabase'

// Steps:
// 1. Auth with Gmail API using OAuth2 credentials
// 2. List unread messages matching query: "has:attachment filename:.md OR label:inbox"
// 3. For each message: get attachment, decode base64, parse markdown
// 4. Lookup researcher by tag → get owner_id from researchers table
// 5. Insert artifact via supabaseAdmin()
// 6. Mark message read
```

Add to `package.json`:
```json
"ingest-email": "bun scripts/ingest-email.ts"
```

### New env vars (add to `.env.example`)

```
# Gmail ingestion
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
GMAIL_MONITORED_ADDRESS=drewmanley16@gmail.com
```

### Getting Gmail OAuth credentials

1. Go to Google Cloud Console → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID (Desktop app)
3. Enable Gmail API
4. Run one-time OAuth flow to get refresh token:
   ```
   bun scripts/gmail-auth.ts   # one-time setup helper
   ```
5. Paste the refresh token into `.env.local`

---

## Running it

**One-shot (manual trigger):**
```bash
bun run ingest-email
```

**On a cron (production / demo setup):**
```bash
# every 5 minutes via cron or Vercel cron job
*/5 * * * * cd /path/to/project && bun run ingest-email
```

---

## Demo use case

For the demo, send a `.md` file to the inbox live on stage:

1. Open phone → Gmail → compose
2. Attach a `.md` file (e.g. `experiment-findings.md`)
3. Subject: `[alice] new visual cortex findings`
4. Send
5. Run `bun run ingest-email` in terminal
6. Refresh `/team` — Alice's new artifact appears instantly

This makes the "living brain" aspect visceral — the audience watches knowledge flow in real time.

---

## Open questions

- [ ] Do we run this as a Vercel cron route (`app/api/ingest-email/route.ts`) or a standalone script?
- [ ] Should the email body itself be ingested if no `.md` attachment is present?
- [ ] Who sets up the Gmail OAuth credentials? (P1 owns the env, should own this setup)
- [ ] Rate limit: Gmail API free tier allows 1B quota units/day — polling every 5 min is well within limits
