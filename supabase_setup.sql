-- ── SUPABASE SQL SETUP FOR LIFE LOGGER ──
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql/new)

-- 1. Enable pgvector extension for semantic search
create extension if not exists vector;

-- 2. Create the entries table
create table if not exists entries (
  id uuid default gen_random_uuid() primary key,
  user_id integer default 1,
  raw_text text not null,
  category text not null,
  entry_time timestamptz not null,
  data jsonb not null default '{}'::jsonb,
  embedding vector(768), -- 768 dimensions for Google Gemini embeddings
  tags text[],            -- hashtag labels for filtering
  event_date date,        -- scheduled event date for calendar queries
  fts tsvector generated always as (to_tsvector('english', coalesce(raw_text, ''))) stored,
  created_at timestamptz default now()
);

-- 3. Create indices for fast lookup
create index if not exists idx_entries_user_time 
  on entries(user_id, entry_time desc);

create index if not exists idx_entries_category 
  on entries(user_id, category, entry_time desc);

-- 4. HNSW vector index for fast approximate nearest neighbor search
create index if not exists idx_entries_embedding_hnsw 
  on entries 
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- 5. GIN index for full-text keyword search (hybrid search readiness)
create index if not exists idx_entries_fts 
  on entries using gin(fts);

-- 6. Create a similarity search function (RAG)
-- Supports multi-category array filtering and tag filtering
create or replace function match_entries (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_categories text[] default null,
  filter_tags text[] default null
)
returns table (
  id uuid,
  raw_text text,
  category text,
  entry_time timestamptz,
  data jsonb,
  tags text[],
  similarity float
)
language sql stable
as $$
  select
    e.id,
    e.raw_text,
    e.category,
    e.entry_time,
    e.data,
    e.tags,
    1 - (e.embedding <=> query_embedding) as similarity
  from entries e
  where 
    e.embedding is not null
    and (1 - (e.embedding <=> query_embedding) > match_threshold)
    and (filter_categories is null or e.category = any(filter_categories))
    and (filter_tags is null or e.tags && filter_tags)
  order by e.embedding <=> query_embedding
  limit match_count;
$$;

-- 7. Create Hybrid Match function (BM25 + Vector Cosine via RRF)
create or replace function hybrid_match_entries (
  query_text text,
  query_embedding vector(768),
  match_threshold float default 0.1,
  match_count int default 20,
  filter_categories text[] default null,
  filter_tags text[] default null,
  rrf_k int default 60
)
returns table (
  id uuid,
  raw_text text,
  category text,
  entry_time timestamptz,
  data jsonb,
  tags text[],
  similarity float,
  rrf_score float
)
language plpgsql stable
as $$
declare
  v_fts_query tsquery;
  v_clean_words text;
begin
  select string_agg(word, ' | ') into v_clean_words
  from (
    select word
    from unnest(regexp_split_to_array(lower(query_text), '[^\w]+')) as word
    where length(word) >= 3 
      and word not in ('how','many','much','times','have','past','days','show','tell','list','what','when','where','with','from','this','that','were','check','log','logs','entry','entries','user')
  ) sub;

  begin
    if v_clean_words is not null and trim(v_clean_words) <> '' then
      v_fts_query := to_tsquery('english', v_clean_words);
    end if;
  exception when others then
    v_fts_query := null;
  end;

  return query
  with vector_matches as (
    select 
      e.id,
      1 - (e.embedding <=> query_embedding) as vec_sim,
      row_number() over (order by e.embedding <=> query_embedding asc) as v_rank
    from entries e
    where e.embedding is not null
      and (1 - (e.embedding <=> query_embedding)) > match_threshold
      and (filter_categories is null or e.category = any(filter_categories))
      and (filter_tags is null or e.tags && filter_tags)
    limit 50
  ),
  fts_matches as (
    select 
      e.id,
      ts_rank_cd(e.fts, v_fts_query) as fts_score,
      row_number() over (order by ts_rank_cd(e.fts, v_fts_query) desc) as f_rank
    from entries e
    where v_fts_query is not null 
      and e.fts @@ v_fts_query
      and (filter_categories is null or e.category = any(filter_categories))
      and (filter_tags is null or e.tags && filter_tags)
    limit 50
  ),
  combined as (
    select 
      coalesce(v.id, f.id) as entry_id,
      v.vec_sim,
      (coalesce(1.0 / (rrf_k + v.v_rank), 0.0) + coalesce(1.0 / (rrf_k + f.f_rank), 0.0))::float as calculated_rrf_score
    from vector_matches v
    full outer join fts_matches f on v.id = f.id
  )
  select 
    e.id,
    e.raw_text,
    e.category,
    e.entry_time,
    e.data,
    e.tags,
    coalesce(c.vec_sim, 0.0)::float as similarity,
    c.calculated_rrf_score as rrf_score
  from combined c
  join entries e on c.entry_id = e.id
  order by c.calculated_rrf_score desc
  limit match_count;
end;
$$;

