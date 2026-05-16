# Supabase Shared Artifact Ingestion

This is the primary P4 live-ingestion path.

Smaller researcher GBrains send data directly to Supabase by inserting into
`artifacts`. They do not run OpenClaw. The head Central GBrain worker
(`awake-purpose`) polls Supabase, adopts new shared artifacts, creates evidence,
runs OpenClaw, and records the shared-state update through brain commits.

## Row Contract

Insert into `artifacts`:

```sql
insert into artifacts (
  owner_id,
  brain_id,
  type,
  tier,
  title,
  content,
  embedding
) values (
  '<researcher uuid>',
  null,
  'note',
  'shared',
  'New finding title',
  'Markdown or plain text content from the smaller GBrain',
  null
);
```

Rules:

- `tier='shared'` means the artifact is allowed into Central GBrain review.
- `brain_id=null` means the head Central GBrain should adopt it.
- `brain_id=<head brain id>` also works.
- `tier='private'` remains researcher-owned and is ignored by the head worker.
- Artifacts attached to a different brain id are ignored.

## Worker Loop

`bun run openclaw:loop` does this every poll:

1. scan shared artifacts visible to the head brain
2. skip rows already represented by `evidence_items.artifact_id`
3. skip duplicate content already represented by `evidence_items.content_hash`
4. adopt `brain_id=null` artifacts by setting `brain_id` to the head brain id
5. create an `ingestion_run`
6. create an `evidence_item`
7. write a `brain_commit`
8. run the head OpenClaw operator
9. apply truth maintenance and write decision/claim commits

Gmail ingestion is optional and disabled unless `EMAIL_INGEST_ENABLED=true`.
