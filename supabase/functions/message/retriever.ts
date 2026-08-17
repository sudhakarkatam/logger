// supabase/functions/message/retriever.ts

import type { ParsedRoute } from './classifier.ts';

const timezone = 'Asia/Kolkata';

export function getIndianDateStr(dateInput?: Date | string): string {
  const d = dateInput ? new Date(dateInput) : new Date();
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = formatter.formatToParts(d);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

/**
 * Call the dedicated internal 'embed' Edge Function
 */
export async function getEmbedding(text: string): Promise<number[] | null> {
  console.log(`[getEmbedding] Invoking internal embed Edge Function for: "${text.substring(0, 45)}..."`);
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl) {
      console.error('[getEmbedding] SUPABASE_URL environment variable is missing');
      return null;
    }

    const url = `${supabaseUrl}/functions/v1/embed`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
        'apikey': anonKey
      },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[getEmbedding] Internal embed function returned status ${res.status}: ${errText}`);
      return null;
    }

    const json = await res.json();
    return json.embedding || null;
  } catch (err: any) {
    console.error('[getEmbedding] Failed to fetch internal embedding service:', err.message);
    return null;
  }
}

/**
 * Contextual RAG Prepending (Anthropic's Technique)
 * Enriches the raw log with timestamp, day of the week, category, and metadata before embedding.
 */
export function buildContextualPayload(rawText: string, category: string, data: any, entryTime?: string): string {
  const dateObj = new Date(entryTime || Date.now());
  const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone });
  const dateStr = dateObj.toISOString().split('T')[0];
  const timeStr = dateObj.toLocaleTimeString('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit' });

  let details = '';
  if (category === 'meal' && data) {
    details = ` | MealType: ${data.meal_type || 'unknown'} | Items: ${Array.isArray(data.items) ? data.items.join(', ') : rawText}`;
  } else if (category === 'expense' && data) {
    details = ` | Amount: ₹${data.amount || 0} | Description: ${data.description || rawText} | Subcategory: ${data.subcategory || 'expense'}`;
  } else if (category === 'sleep' && data) {
    details = ` | Hours: ${data.hours || 0} | Quality: ${data.quality || 'unknown'}`;
  } else if (category === 'work' && data) {
    details = ` | Task: ${data.description || rawText} | Hours: ${data.duration_hours || 'N/A'}`;
  } else if (category === 'exercise' && data) {
    details = ` | Activity: ${data.activity || rawText} | Duration: ${data.duration_minutes || 0} mins`;
  }

  const header = `[Context | Category: ${category} | Day: ${dayOfWeek} | Date: ${dateStr} | Time: ${timeStr}${details}]`;
  return `${header} Raw Text: "${rawText}"`;
}

export interface RetrievedContext {
  candidates: any[];
  historyContext: string;
  aggregateStatsContext: string;
  dailyMetricsContext: string;
  conditionalKitchenContext: string;
  currentDateOnly: string;
  todayFullStr: string;
}

/**
 * Parallel RAG Retrieval Engine with Conditional Context Loading
 */
export async function retrieveContext(
  effectiveQuery: string,
  route: ParsedRoute,
  userId: string,
  supabaseClient: any
): Promise<RetrievedContext> {
  const currentDateOnly = getIndianDateStr();
  const todayFullStr = new Date().toLocaleString('en-US', { timeZone: timezone });
  const lowerQuery = effectiveQuery.toLowerCase();
  const hashtags = (effectiveQuery.match(/#([a-zA-Z0-9\-_]+)/g) || []).map(tag => tag.substring(1).toLowerCase());

  // 1. Parallel Task A: Generate Vector Embedding
  const queryVectorPromise = getEmbedding(effectiveQuery);

  // 2. Parallel Task B: Quantitative Math RPC (if applicable)
  let mathPromise: Promise<any> = Promise.resolve(null);
  let quantDirectPromise: Promise<any> = Promise.resolve({ data: [] });
  if (route.isQuantitative && route.mathParams) {
    mathPromise = supabaseClient.rpc('get_aggregate_stats', {
      p_user_id: userId,
      p_category: route.mathParams.category,
      p_op: route.mathParams.op,
      p_field: route.mathParams.field || null,
      p_filter_key: route.mathParams.filter_key || null,
      p_filter_val: route.mathParams.filter_val !== null ? String(route.mathParams.filter_val) : null,
      p_days: route.mathParams.days || 30
    });

    // Direct DB fetch: pull ALL entries for this category within the date range
    // so the LLM sees every entry the aggregate counted
    const quantCutoff = new Date();
    quantCutoff.setDate(quantCutoff.getDate() - (route.mathParams.days || 30));
    quantDirectPromise = supabaseClient
      .from('entries')
      .select('id, entry_time, category, raw_text, data, tags, event_date')
      .eq('user_id', userId)
      .eq('category', route.mathParams.category)
      .gte('entry_time', quantCutoff.toISOString())
      .order('entry_time', { ascending: false })
      .limit(50);
  }

  // 3. Parallel Task C: FTS Keyword Search
  let ftsPromise: Promise<any> = Promise.resolve({ data: [] });
  const cleanedQueryWords = effectiveQuery
    .replace(/[^\w\s]/gi, ' ')
    .trim()
    .split(/\s+/)
    .filter(w => w.length >= 3 && !['how', 'many', 'much', 'times', 'have', 'past', 'days', 'show', 'tell', 'list', 'what', 'when', 'where', 'with', 'from', 'this', 'that', 'were', 'check'].includes(w.toLowerCase()));

  if (cleanedQueryWords.length > 0) {
    const tsQueryStr = cleanedQueryWords.join(' | ');
    ftsPromise = supabaseClient
      .from('entries')
      .select('id, entry_time, category, raw_text, data, tags, event_date')
      .eq('user_id', userId)
      .textSearch('fts', tsQueryStr, { config: 'english' })
      .order('entry_time', { ascending: false })
      .limit(30);
  }

  // 4. Parallel Task D: Recent Fallback Logs
  let recentLogsPromise = supabaseClient
    .from('entries')
    .select('id, entry_time, category, raw_text, data, tags, event_date')
    .eq('user_id', userId);

  if (route.targetCategories.length > 0) {
    recentLogsPromise = recentLogsPromise.in('category', route.targetCategories);
  }
  if (hashtags.length > 0) {
    recentLogsPromise = recentLogsPromise.contains('tags', hashtags);
  }
  const recentLogsFinal = recentLogsPromise.order('entry_time', { ascending: false }).limit(20);

  // 5. Parallel Task E: Conditional Calendar Events (only for date queries)
  const isDateQuery = /(today|tomorrow|yesterday|this week|next|schedule|event|plan|cal|upcoming|test|exam|\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))/i.test(lowerQuery);
  let calPromise: Promise<any> = Promise.resolve({ data: [] });
  if (isDateQuery) {
    calPromise = supabaseClient
      .from('entries')
      .select('id, entry_time, category, raw_text, data, tags, event_date')
      .eq('user_id', userId)
      .not('event_date', 'is', null)
      .gte('event_date', currentDateOnly)
      .order('event_date', { ascending: true })
      .limit(15);
  }

  // 6. Parallel Task F: Conditional 30-Day Daily Metrics Table (only for trends/comparisons/summaries)
  const isTrendQuery = /(compare|trend|pattern|week|month|summary|report|average|overview|daily|history|everything|all logs)/i.test(lowerQuery);
  let summaryPromise: Promise<any> = Promise.resolve({ data: [] });
  if (isTrendQuery) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    summaryPromise = supabaseClient
      .from('entries')
      .select('entry_time, category, data')
      .eq('user_id', userId)
      .gte('entry_time', thirtyDaysAgo.toISOString())
      .order('entry_time', { ascending: true });
  }

  // 7. Parallel Task G: Conditional Pantry & Recipes (only for cooking/pantry questions)
  const isKitchenQuery = /(recipe|pantry|cook|fridge|kitchen|ingredient|stock)/i.test(lowerQuery);
  let pantryPromise: Promise<any> = Promise.resolve({ data: [] });
  let recipePromise: Promise<any> = Promise.resolve({ data: [] });
  if (isKitchenQuery) {
    pantryPromise = supabaseClient.from('pantry').select('name, quantity, unit, expiry_date').eq('user_id', userId).order('expiry_date', { ascending: true });
    recipePromise = supabaseClient.from('recipes').select('name, ingredients, instructions').eq('user_id', userId);
  }

  // Execute all initial promises simultaneously in parallel!
  const [
    queryVector,
    mathRes,
    ftsRes,
    recentRes,
    calRes,
    summaryRes,
    pantryRes,
    recipeRes,
    quantDirectRes
  ] = await Promise.all([
    queryVectorPromise,
    mathPromise,
    ftsPromise,
    recentLogsFinal,
    calPromise,
    summaryPromise,
    pantryPromise,
    recipePromise,
    quantDirectPromise
  ]);

  // Stage 1 Hybrid Match (Vector + BM25 RRF)
  let semanticMatches: any[] = [];
  if (queryVector) {
    const rpcParams: any = {
      query_text: effectiveQuery,
      query_embedding: queryVector,
      match_threshold: 0.10,
      match_count: 30,
      filter_categories: route.targetCategories
    };
    if (hashtags.length > 0) {
      rpcParams.filter_tags = hashtags;
    }

    const { data: matches, error: rpcErr } = await supabaseClient.rpc('hybrid_match_entries', rpcParams);
    if (rpcErr) {
      console.error('[retrieveContext] hybrid_match_entries error, falling back to match_entries:', rpcErr.message);
      const { data: fallbackMatches } = await supabaseClient.rpc('match_entries', rpcParams);
      if (fallbackMatches) semanticMatches = fallbackMatches;
    } else if (matches) {
      semanticMatches = matches;
    }
  }

  // Format Quantitative Math summary string
  let aggregateStatsContext = '';
  if (route.isQuantitative && route.mathParams && mathRes && !mathRes.error && mathRes.data !== undefined) {
    const statsVal = mathRes.data;
    const opName = route.mathParams.op === 'sum' ? 'Total sum' : (route.mathParams.op === 'avg' ? 'Average' : 'Total count');
    const fieldLabel = route.mathParams.field ? ` of ${route.mathParams.field}` : '';
    const filterLabel = route.mathParams.filter_key ? ` (filtered by ${route.mathParams.filter_key} = ${route.mathParams.filter_val})` : '';

    aggregateStatsContext = `AGGREGATE DATABASE CALCULATIONS SUMMARY:
- Metric: ${opName}${fieldLabel}${filterLabel} over the past ${route.mathParams.days} days
- Computed Metric Value: ${statsVal}
- Instruction: Use this metric value as primary quantitative guidance, but always verify and cross-reference with any matching individual log entries in the history context below.`;
  }

  // Format Daily Metrics Table (if loaded)
  let dailyMetricsContext = '';
  if (summaryRes?.data && summaryRes.data.length > 0) {
    const dailySummaries: Record<string, { calories: number, sleep_hours: number, expense_inr: number, exercises: string[] }> = {};
    summaryRes.data.forEach((row: any) => {
      const dateStr = row.entry_time.split('T')[0];
      if (!dailySummaries[dateStr]) {
        dailySummaries[dateStr] = { calories: 0, sleep_hours: 0, expense_inr: 0, exercises: [] };
      }
      const day = dailySummaries[dateStr];
      if (row.category === 'meal' && row.data?.nutrition?.calories) {
        day.calories += Number(row.data.nutrition.calories);
      }
      if (row.category === 'sleep' && row.data?.hours) {
        day.sleep_hours += Number(row.data.hours);
      }
      if (row.category === 'expense' && row.data?.amount) {
        day.expense_inr += Number(row.data.amount);
      }
      if (row.category === 'exercise' && row.data?.activity) {
        day.exercises.push(row.data.activity);
      }
    });

    const summaryKeys = Object.keys(dailySummaries).sort().reverse();
    if (summaryKeys.length > 0) {
      dailyMetricsContext = `DAILY LOG METRICS SUMMARY (PAST 30 DAYS):\n` +
        `Date | Calories | Sleep Hours | Expenses (INR) | Exercises\n` +
        `---|---|---|---|---\n` +
        summaryKeys.map(k => {
          const d = dailySummaries[k];
          return `${k} | ${d.calories || 0} kcal | ${d.sleep_hours || 0} hrs | ₹${d.expense_inr || 0} | ${d.exercises.join(', ') || 'None'}`;
        }).join('\n');
    }
  }

  // Format Conditional Kitchen Context (if loaded)
  let conditionalKitchenContext = '';
  if (isKitchenQuery) {
    const pantryStock = pantryRes?.data || [];
    const recipes = recipeRes?.data || [];
    const pantryStockStr = pantryStock.length > 0
      ? pantryStock.map((p: any) => `- "${p.name}": ${p.quantity} ${p.unit} (Expires: ${p.expiry_date || 'No Expiry'})`).join('\n')
      : 'Pantry is empty.';
    const recipesStr = recipes.length > 0
      ? recipes.map((r: any) => `- "${r.name}": Requires ${JSON.stringify(r.ingredients)}. Instructions: ${r.instructions || 'None'}`).join('\n')
      : 'No recipes saved in your cookbook.';

    conditionalKitchenContext = `\n\nCONDITIONAL KITCHEN & COOKBOOK CONTEXT:
CURRENT PANTRY STOCK:
${pantryStockStr}

SAVED RECIPES:
${recipesStr}`;
  }

  // Merge and deduplicate by entry ID
  const mergedMap = new Map<string, any>();
  semanticMatches.forEach(m => mergedMap.set(m.id, m));
  (ftsRes?.data || []).forEach((f: any) => mergedMap.set(f.id, f));
  (recentRes?.data || []).forEach((r: any) => mergedMap.set(r.id, r));
  (calRes?.data || []).forEach((c: any) => mergedMap.set(c.id, c));
  // Quantitative direct fetch: guarantees all category entries in date range are present
  (quantDirectRes?.data || []).forEach((q: any) => mergedMap.set(q.id, q));

  const mergedEntries = Array.from(mergedMap.values());
  mergedEntries.sort((a, b) => new Date(b.entry_time).getTime() - new Date(a.entry_time).getTime());

  // Build History Context Lines
  let historyContext = '';
  if (mergedEntries.length > 0) {
    historyContext = mergedEntries.map((e: any) => {
      const entryDateStr = e.entry_time.split('T')[0];
      const d1 = new Date(currentDateOnly + 'T00:00:00');
      const d2 = new Date(entryDateStr + 'T00:00:00');
      const diffTime = d2.getTime() - d1.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      let relativeStr = '';
      if (diffDays === 0) relativeStr = 'today';
      else if (diffDays === 1) relativeStr = 'tomorrow';
      else if (diffDays === -1) relativeStr = 'yesterday';
      else if (diffDays > 1) relativeStr = `${diffDays} days from now`;
      else if (diffDays < -1) relativeStr = `${Math.abs(diffDays)} days ago`;

      let calendarStr = '';
      if (e.event_date) {
        calendarStr = ` [Scheduled Event Date: ${e.event_date}]`;
      }

      let detailsStr = '';
      if (e.data) {
        if (e.category === 'meal') {
          detailsStr = e.data.skipped
            ? `Skipped ${e.data.meal_type || 'meal'}`
            : `${e.data.meal_type || 'Meal'}: ${(Array.isArray(e.data.items) && e.data.items.length > 0 ? e.data.items.join(', ') : e.raw_text)}`;
        } else if (e.category === 'sleep') {
          detailsStr = `${e.data.hours || 0} hours sleep`;
        } else if (e.category === 'expense') {
          detailsStr = `₹${e.data.amount || 0} for ${e.data.description || e.raw_text}`;
        } else if (e.category === 'exercise') {
          detailsStr = `${e.data.activity || 'Exercise'} (${e.data.duration_minutes || 0} mins)`;
        } else if (e.category === 'work') {
          detailsStr = `${e.data.description || 'Work'} (${e.data.duration_hours || 'N/A'} hrs)`;
        } else if (e.category === 'mood') {
          detailsStr = `Mood: ${e.data.mood || 'Logged Mood'} ("${e.raw_text}")`;
        } else {
          detailsStr = (e.raw_text || '').replace(/\*/g, '').trim();
        }
      } else {
        detailsStr = (e.raw_text || '').replace(/\*/g, '').trim();
      }

      const entryTimeStr = new Date(e.entry_time).toLocaleTimeString('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      const entryTime24Str = new Date(e.entry_time).toLocaleTimeString('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      return `-[Time: ${entryTimeStr} / ${entryTime24Str} (24h)] [Date: ${entryDateStr}] (${relativeStr})${calendarStr} [Category: ${e.category}] Text: "${e.raw_text}" | Summary: ${detailsStr}`;
    }).join('\n');
  }

  return {
    candidates: mergedEntries,
    historyContext,
    aggregateStatsContext,
    dailyMetricsContext,
    conditionalKitchenContext,
    currentDateOnly,
    todayFullStr
  };
}
