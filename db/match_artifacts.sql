-- Run this in Supabase SQL editor once.
-- Enables pgvector cosine similarity search over shared artifacts.
create or replace function match_artifacts(
  query_embedding vector(1024),
  match_count int default 10
)
returns table (
  id uuid,
  owner_id uuid,
  type text,
  tier text,
  title text,
  content text,
  similarity float
)
language sql stable
as $$
  select
    id,
    owner_id,
    type,
    tier,
    title,
    content,
    1 - (embedding <=> query_embedding) as similarity
  from artifacts
  where tier = 'shared'
    and embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;
