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
  created_at timestamptz default now()
);

-- 3. Create indices for fast lookup
create index if not exists idx_entries_user_time 
  on entries(user_id, entry_time desc);

create index if not exists idx_entries_category 
  on entries(user_id, category, entry_time desc);

-- 4. Create a similarity search function (RAG)
-- This performs a cosine similarity lookup against entries
create or replace function match_entries (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_category text default null
)
returns table (
  id uuid,
  raw_text text,
  category text,
  entry_time timestamptz,
  data jsonb,
  similarity float
)
language sql stable
as $$
  select
    id,
    raw_text,
    category,
    entry_time,
    data,
    1 - (entries.embedding <=> query_embedding) as similarity
  from entries
  where 
    (1 - (entries.embedding <=> query_embedding) > match_threshold)
    and (filter_category is null or entries.category = filter_category)
  order by entries.embedding <=> query_embedding
  limit match_count;
$$;
