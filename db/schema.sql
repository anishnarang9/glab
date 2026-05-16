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
  type       text not null check (type in ('project', 'note', 'paper_ref', 'finding', 'hypothesis')),
  tier       text not null default 'private' check (tier in ('private', 'shared')),
  title      text,
  content    text not null,
  embedding  vector(1024),
  created_at timestamptz default now()
);

create index on artifacts using hnsw (embedding vector_cosine_ops);
create index on artifacts (tier, owner_id);

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
