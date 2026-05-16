-- Enable pgvector extension (run once per Supabase project)
create extension if not exists vector;

-- Researchers in the demo lab
create table researchers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null unique,
  created_at timestamptz default now()
);

-- All researcher artifacts: projects, notes, paper_refs, findings, hypotheses
create table artifacts (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid references researchers(id) on delete cascade,
  brain_id   uuid,
  type       text not null check (type in ('project', 'note', 'paper_ref', 'finding', 'hypothesis')),
  tier       text not null default 'private' check (tier in ('private', 'shared')),
  title      text,
  content    text not null,
  embedding  vector(1024),
  created_at timestamptz default now()
);

create index on artifacts using hnsw (embedding vector_cosine_ops);
create index on artifacts (tier, owner_id);
create index on artifacts (brain_id);

-- Papers pulled from arXiv
create table papers (
  id           uuid primary key default gen_random_uuid(),
  arxiv_id     text unique not null,
  title        text not null,
  abstract     text not null,
  authors      text[],
  published_at timestamptz,
  embedding    vector(1024),
  ingested_at  timestamptz default now()
);

create index on papers using hnsw (embedding vector_cosine_ops);

-- Paper-to-project relationship judgments
create table paper_matches (
  id                  uuid primary key default gen_random_uuid(),
  paper_id            uuid references papers(id) on delete cascade,
  project_artifact_id uuid references artifacts(id) on delete cascade,
  researcher_id       uuid references researchers(id) on delete cascade,
  relationship        text check (relationship in ('validates', 'suggests_change', 'extends', 'scoops', 'orthogonal')),
  rationale           text,
  confidence          float check (confidence >= 0 and confidence <= 1),
  created_at          timestamptz default now()
);

create index on paper_matches (researcher_id, created_at desc);

-- Central GBrain entities
create table brains (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  subject    text not null,
  mission    text,
  status     text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_at timestamptz default now()
);

alter table artifacts
  add constraint artifacts_brain_id_fkey
  foreign key (brain_id) references brains(id) on delete set null;

-- Sources the Central GBrain learns from.
create table brain_sources (
  id              uuid primary key default gen_random_uuid(),
  brain_id        uuid references brains(id) on delete cascade,
  kind            text not null check (kind in ('arxiv_query', 'rss_feed', 'web_page', 'researcher_shared_artifacts', 'manual_upload')),
  label           text not null,
  config          jsonb not null default '{}'::jsonb,
  cadence         text not null default 'manual' check (cadence in ('manual', 'hourly', 'daily')),
  enabled         boolean not null default true,
  last_checked_at timestamptz,
  created_at      timestamptz default now(),
  unique (brain_id, kind, label)
);

create index on brain_sources (brain_id, enabled);
create index on brain_sources (kind);

-- OpenClaw is the autonomous operator for the head Central GBrain.
-- Researcher GBrains do not get OpenClaw instances; they only contribute data.
create table openclaw_instances (
  id                uuid primary key default gen_random_uuid(),
  brain_id          uuid not null references brains(id) on delete cascade,
  name              text not null,
  role              text not null default 'head_gbrain_operator' check (role in ('head_gbrain_operator')),
  endpoint_url      text,
  status            text not null default 'active' check (status in ('active', 'paused', 'revoked')),
  access_scope      jsonb not null default '{}'::jsonb,
  last_heartbeat_at timestamptz,
  created_at        timestamptz default now(),
  unique (brain_id, name)
);

create index on openclaw_instances (brain_id, status);

-- Every run is recorded so morning jobs and live ingests cannot fail silently.
create table ingestion_runs (
  id          uuid primary key default gen_random_uuid(),
  brain_id    uuid references brains(id) on delete cascade,
  source_id   uuid references brain_sources(id) on delete set null,
  trigger     text not null check (trigger in ('morning_cron', 'manual', 'researcher_share', 'source_refresh', 'openclaw_worker')),
  status      text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'skipped')),
  started_at  timestamptz default now(),
  finished_at timestamptz,
  error       text
);

create index on ingestion_runs (brain_id, started_at desc);
create index on ingestion_runs (source_id, started_at desc);

-- Raw incoming knowledge that can be cited by truth claims.
create table evidence_items (
  id           uuid primary key default gen_random_uuid(),
  brain_id     uuid references brains(id) on delete cascade,
  source_id    uuid references brain_sources(id) on delete set null,
  ingestion_run_id uuid references ingestion_runs(id) on delete set null,
  artifact_id  uuid references artifacts(id) on delete set null,
  paper_id     uuid references papers(id) on delete set null,
  source_kind  text not null,
  source_ref   text,
  title        text,
  content      text not null,
  url          text,
  published_at timestamptz,
  embedding    vector(1024),
  content_hash text not null,
  created_at   timestamptz default now(),
  unique (brain_id, content_hash)
);

create index on evidence_items using hnsw (embedding vector_cosine_ops);
create index on evidence_items (brain_id, created_at desc);
create index on evidence_items (source_id, created_at desc);
create index on evidence_items (artifact_id);
create index on evidence_items (paper_id);

-- OpenClaw decides which observations affect shared truth and why.
create table openclaw_decisions (
  id               uuid primary key default gen_random_uuid(),
  brain_id         uuid not null references brains(id) on delete cascade,
  instance_id      uuid references openclaw_instances(id) on delete set null,
  ingestion_run_id uuid references ingestion_runs(id) on delete set null,
  evidence_id      uuid references evidence_items(id) on delete set null,
  decision_type    text not null check (decision_type in ('ingest', 'skip', 'claim_created', 'claim_supported', 'claim_contradicted', 'claim_refined', 'request_human_review')),
  subject          text not null,
  rationale        text,
  confidence       float check (confidence >= 0 and confidence <= 1),
  payload          jsonb not null default '{}'::jsonb,
  status           text not null default 'proposed' check (status in ('proposed', 'applied', 'rejected', 'failed')),
  created_at       timestamptz default now(),
  applied_at       timestamptz,
  error            text
);

create index on openclaw_decisions (brain_id, created_at desc);
create index on openclaw_decisions (instance_id, created_at desc);
create index on openclaw_decisions (evidence_id);
create index on openclaw_decisions (status);

-- Current beliefs of the Central GBrain.
create table truth_claims (
  id                  uuid primary key default gen_random_uuid(),
  brain_id            uuid references brains(id) on delete cascade,
  statement           text not null,
  status              text not null default 'active' check (status in ('active', 'contested', 'superseded', 'retracted')),
  confidence          float check (confidence >= 0 and confidence <= 1),
  current_revision_id uuid,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create index on truth_claims (brain_id, status, updated_at desc);

-- Git-like commits describing how the brain changed.
create table brain_commits (
  id               uuid primary key default gen_random_uuid(),
  brain_id         uuid references brains(id) on delete cascade,
  parent_commit_id uuid references brain_commits(id) on delete set null,
  ingestion_run_id uuid references ingestion_runs(id) on delete set null,
  kind             text not null check (kind in ('source_ingested', 'evidence_added', 'openclaw_decision', 'claim_created', 'claim_supported', 'claim_weakened', 'claim_contradicted', 'claim_refined', 'researcher_relevance_changed', 'digest_rendered')),
  summary          text not null,
  commit_hash      text not null unique,
  created_at       timestamptz default now()
);

create index on brain_commits (brain_id, created_at desc);
create index on brain_commits (parent_commit_id);
create index on brain_commits (ingestion_run_id);

create table truth_revisions (
  id         uuid primary key default gen_random_uuid(),
  claim_id   uuid references truth_claims(id) on delete cascade,
  commit_id  uuid references brain_commits(id) on delete cascade,
  statement  text not null,
  confidence float check (confidence >= 0 and confidence <= 1),
  rationale  text,
  created_at timestamptz default now()
);

create index on truth_revisions (claim_id, created_at desc);
create index on truth_revisions (commit_id);

alter table truth_claims
  add constraint truth_claims_current_revision_id_fkey
  foreign key (current_revision_id) references truth_revisions(id) on delete set null;

create table truth_evidence_edges (
  id           uuid primary key default gen_random_uuid(),
  claim_id     uuid references truth_claims(id) on delete cascade,
  evidence_id  uuid references evidence_items(id) on delete cascade,
  relationship text not null check (relationship in ('supports', 'contradicts', 'refines', 'duplicates', 'background', 'orthogonal')),
  rationale    text,
  confidence   float check (confidence >= 0 and confidence <= 1),
  created_at   timestamptz default now()
);

create index on truth_evidence_edges (claim_id);
create index on truth_evidence_edges (evidence_id);

create table brain_commit_changes (
  id          uuid primary key default gen_random_uuid(),
  commit_id   uuid references brain_commits(id) on delete cascade,
  entity_type text not null check (entity_type in ('source', 'run', 'evidence', 'claim', 'revision', 'edge', 'digest', 'artifact', 'operator', 'decision')),
  entity_id   uuid not null,
  change_type text not null check (change_type in ('created', 'updated', 'linked', 'skipped')),
  before_json jsonb,
  after_json  jsonb,
  created_at  timestamptz default now()
);

create index on brain_commit_changes (commit_id);
create index on brain_commit_changes (entity_type, entity_id);
