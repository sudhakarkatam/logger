-- ══════════════════════════════════════════════════════════════════
-- PRODUCTION RAG HARDENING MIGRATION
-- Run this in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/_/sql/new
-- ══════════════════════════════════════════════════════════════════

-- ─── 1. HNSW VECTOR INDEX ───────────────────────────────────────
-- Enables fast approximate nearest neighbor search (O(log n) vs O(n))
-- m=16: bi-directional links per node | ef_construction=64: build-time candidate list size
CREATE INDEX IF NOT EXISTS idx_entries_embedding_hnsw 
  ON public.entries 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);


-- ─── 2. UPGRADED match_entries RPC ──────────────────────────────
-- Fixes: Edge Functions pass filter_categories (text[]) and filter_tags (text[]),
-- but old function only accepted filter_category (text). This was silently broken.

-- Drop old function signature to avoid overload conflicts
DROP FUNCTION IF EXISTS match_entries(vector(768), float, int, text);

-- New function: supports multi-category array + tag array filtering
CREATE OR REPLACE FUNCTION match_entries (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_categories text[] DEFAULT NULL,
  filter_tags text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  raw_text text,
  category text,
  entry_time timestamptz,
  data jsonb,
  tags text[],
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    e.id,
    e.raw_text,
    e.category,
    e.entry_time,
    e.data,
    e.tags,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM entries e
  WHERE 
    e.embedding IS NOT NULL
    AND (1 - (e.embedding <=> query_embedding)) > match_threshold
    AND (filter_categories IS NULL OR e.category = ANY(filter_categories))
    AND (filter_tags IS NULL OR e.tags && filter_tags)
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;


-- ─── 3. FULL-TEXT SEARCH COLUMN (Hybrid Search Readiness) ──────
-- Auto-populated tsvector column for future BM25 keyword search
ALTER TABLE public.entries 
  ADD COLUMN IF NOT EXISTS fts tsvector 
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(raw_text, ''))) STORED;

-- GIN index for fast full-text keyword lookups
CREATE INDEX IF NOT EXISTS idx_entries_fts 
  ON public.entries USING gin(fts);


-- ─── VERIFICATION QUERIES (Optional - run after migration) ─────
-- Check HNSW index exists:
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'entries' AND indexname LIKE '%hnsw%';

-- Check FTS column populated:
-- SELECT id, left(raw_text, 40), fts FROM entries LIMIT 5;

-- Test upgraded match_entries with array filter:
-- SELECT * FROM match_entries(
--   (SELECT embedding FROM entries WHERE embedding IS NOT NULL LIMIT 1),
--   0.15, 5, ARRAY['meal', 'sleep']
-- );
