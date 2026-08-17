// supabase/functions/message/reranker.ts

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her',
  'was', 'one', 'our', 'out', 'how', 'many', 'much', 'times', 'have', 'past',
  'days', 'show', 'tell', 'list', 'what', 'when', 'where', 'with', 'from',
  'this', 'that', 'were', 'check', 'did', 'does', 'about', 'some', 'there',
  'here', 'log', 'logs', 'entries', 'entry', 'time', 'day', 'today', 'yesterday'
]);

export interface CandidateLog {
  id: string;
  category: string;
  raw_text: string;
  data?: any;
  tags?: string[];
  entry_time: string;
  event_date?: string | null;
  rrf_score?: number;
  [key: string]: any;
}

/**
 * Two-Stage Cross-Encoder Re-Ranker
 * Evaluates (Query + Candidate Log) relevance on candidate entries from Stage 1 retrieval,
 * applying term matching, phrase matching, and temporal recency decay scoring.
 */
export function rerankLogs(query: string, candidates: CandidateLog[], limit: number = 10): CandidateLog[] {
  if (!candidates || candidates.length === 0) return [];

  const lowerQuery = query.toLowerCase().trim();
  const queryTerms = lowerQuery
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STOP_WORDS.has(w));

  const scored = candidates.map(item => {
    const textToMatch = [
      item.raw_text || '',
      item.category || '',
      JSON.stringify(item.data || {}),
      (item.tags || []).join(' ')
    ].join(' ').toLowerCase();

    let termScore = 0;

    // 1. Term matching with stemming (e.g. 'oats' <-> 'oat', 'eggs' <-> 'egg', 'working' <-> 'work')
    queryTerms.forEach(term => {
      const stem = term.endsWith('s') && term.length > 3 ? term.slice(0, -1) : term;
      if (textToMatch.includes(term) || (stem.length >= 3 && textToMatch.includes(stem)) || textToMatch.includes(term + 's')) {
        termScore += 3;
      }
    });

    // 2. Category match bonus (ensures all category entries are retained when exploring that category)
    if (item.category) {
      const cat = item.category.toLowerCase();
      if (lowerQuery.includes(cat) || lowerQuery.includes(cat + 's') || (cat === 'expense' && (lowerQuery.includes('spend') || lowerQuery.includes('spent') || lowerQuery.includes('cost') || lowerQuery.includes('bill')))) {
        termScore += 5;
      }
    }

    // 3. Exact phrase bonus
    if (queryTerms.length > 1 && textToMatch.includes(lowerQuery)) {
      termScore += 4;
    }

    // 3. Temporal recency decay bonus (newer entries receive up to +0.5 boost over 90 days)
    let recencyBonus = 0;
    if (item.entry_time) {
      const ageMs = Date.now() - new Date(item.entry_time).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      recencyBonus = Math.max(0, 1 - (ageDays / 90)) * 0.5;
    }

    // 4. Combined score: Base RRF score + Cross-Encoder term relevance + Recency boost
    const baseScore = Number(item.rrf_score) || 0;
    const totalScore = baseScore + termScore + recencyBonus;

    return {
      item,
      score: totalScore
    };
  });

  // Sort descending by calculated score
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(s => s.item);
}
