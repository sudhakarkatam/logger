import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { GoogleGenAI } from "npm:@google/genai@1.0.0";
import OpenAI from "npm:openai@4.56.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── LLM Client Callers ──

async function callLLM(config: any, systemPrompt: string, userMessage: string): Promise<string> {
  console.log(`[callLLM] Provider: ${config.provider}, Model: ${config.model || 'default'}`);
  const { provider, apiKey, model } = config;

  if (!apiKey) {
    throw new Error(`API key is missing for LLM provider: ${provider}`);
  }

  const defaultModelMap: Record<string, string> = {
    gemini: 'gemini-2.0-flash',
    groq: 'llama-3.3-70b-versatile',
    openrouter: 'openrouter/free',
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-5-haiku-latest',
  };

  const activeModel = model || defaultModelMap[provider] || 'gemini-2.0-flash';

  if (provider === 'gemini') {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: activeModel,
      contents: userMessage,
      config: { systemInstruction: systemPrompt },
    });
    return response.text || '';
  }

  let baseURL = 'https://api.openai.com/v1';
  if (provider === 'groq') baseURL = 'https://api.groq.com/openai/v1';
  if (provider === 'openrouter') baseURL = 'https://openrouter.ai/api/v1';

  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: activeModel,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error: ${err}`);
    }
    const data = await res.json();
    return data.content[0].text || '';
  }

  const client = new OpenAI({ apiKey, baseURL });
  const completion = await client.chat.completions.create({
    model: activeModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.3,
  });

  return completion.choices[0].message.content || '';
}

// ── Call the Dedicated Internal 'embed' Edge Function ──

async function getEmbedding(text: string): Promise<number[] | null> {
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

// ── Prompt Builders ──

function buildSystemPrompt(timezone: string): string {
  return `You are a life-logging assistant. Parse the user's message into structured JSON.
Timezone: ${timezone}
Current Time: ${new Date().toLocaleString('en-US', { timeZone: timezone })}

Return ONLY a JSON object:
{
  "category": "meal" | "mood" | "exercise" | "sleep" | "expense" | "other",
  "entry_time": ISO 8601 datetime string,
  "data": category-specific fields,
  "tags": string[] or null,
  "acknowledgment": "friendly reply confirmation",
  "needs_clarification": boolean,
  "clarification_prompt": string or null,
  "action": "insert" | "update" | "delete" | "cancel" | "bulk_insert",
  "bulk_entries": [
    {
      "category": "meal" | "mood" | "exercise" | "sleep" | "expense" | "other",
      "entry_time": ISO 8601 string,
      "data": object,
      "raw_text": string
    }
  ] | null,
  "update_entry_id": string or null,
  "delete_entry_ids": string[] or null,
  "event_date": "YYYY-MM-DD" or null
}

Strict Rules:
1. Category Schemas:
   - meal: { "meal_type": "breakfast|lunch|dinner|snack", "skipped": boolean, "items": ["item1"], "nutrition": { "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number } }
     - If the user explicitly mentions skipping a meal (e.g. "skipped lunch today", "did not eat breakfast", "skipping dinner"), set "skipped": true, "items": [], and "nutrition": null.
     - Otherwise, set "skipped": false.
   - sleep: { "hours": number, "quality": "good|fair|poor|null" }
   - expense: { "amount": number, "currency": "INR", "description": "what it was for", "subcategory": "food|transport|shopping|bills|other" }
   - mood: { "mood": "happy|sad|tired|anxious|neutral", "intensity": 1-10 }
   - exercise: { "activity": "running|walking|gym", "duration_minutes": number, "distance_km": number|null }
   - other: { "description": "text summary" }
     - Use this category for general knowledge, reminders, plans, pending tasks, learning goals, or any facts/statements the user wants to remember (e.g., "29 july I have a test", "planned to learn React this week").
     - Clean the description to remove trigger phrases like "remember this", "log this", "log it", "save this", or "remind me to" from the final stored description.
     - If the user's message is describing an event, test, task, meeting, or plan scheduled for a specific date in the future (e.g. "29 july I have a test", "tomorrow meeting"), resolve that date into a "YYYY-MM-DD" string (using the Current Time above as your calendar anchor reference) and set it in the "event_date" root field of the returned JSON object. Otherwise, set "event_date" to null.

2. Clarification & Logging Friction Rules:
   - Do NOT prompt for optional details. If sleep quality or nutrition is missing, default it to null and log it immediately. Do NOT ask for it.

3. Image Logging Rules (Immediate Save & Update):
   - Whenever an image URL is attached, ALWAYS insert the log immediately in the first turn. NEVER return needs_clarification=true on the first turn when an image is attached.
   - If the description accompanying the image is generic (e.g. "📷 Sent a photo", "test", "upload", "image"), categorize it as "other" and set the acknowledgment to: "I've logged your photo. What is this photo about? (You can reply to describe it, or ignore this to do something else)."
   - If the user's message is describing a recently uploaded photo (specifically replying to describe a generic raw_text like 'test' or '📷 Sent a photo' which contains an 'image_url' in its data, e.g. "it's my breakfast oatmeal"):
     - Set "action": "update".
     - Set "update_entry_id": The exact ID string of that recent image entry.
     - Parse the description into its appropriate category (e.g. "meal" if they say "it's my breakfast oatmeal") and set the acknowledgment to: "Successfully updated your photo description."

4. UUID Constraints (CRITICAL):
   - When outputting "update_entry_id" or "delete_entry_ids", you MUST only extract and copy the exact 36-character UUID strings (e.g., '7c5f87b2-60be-4a5f-9e7f-7798380b2ff8') found after the 'LOG_ID: ' label in the RECENT LOGS list.
   - NEVER hallucinate, invent, or use placeholder IDs like 'sleep_log_id_1', 'id_1', 'sleep_log_id_2', or '1'. If you cannot locate the correct UUID strings, set update_entry_id/delete_entry_ids to null.

5. Deletion Safety Instructions (When user wants to remove/delete logs or duplicates):
   - Deleting data is destructive, so you MUST ALWAYS require confirmation first. Never delete directly on the first command.
   - First Turn (If draftContext is null):
     - Identify the matching logs to delete by scanning their details and IDs in the RECENT LOGS list.
     - Set "needs_clarification": true.
     - Set "clarification_prompt": "Are you sure you want to delete [details]?"
     - Set "action": "insert" (default).
     - Set "delete_entry_ids": An array of one or more UUID strings of the candidates to delete.

6. Explicit Hashtag Rules (Strictly User-Defined):
   - A log only gets tags if the user explicitly typed words starting with a '#' symbol in their message (e.g. '#cheatmeal', '#fitness').
   - Extract the tag name (without the '#' symbol, converted to lowercase) and put it in the "tags" array.
   - If the user did not use any '#' symbols in their message, the "tags" array MUST be empty [].
   - If the user is requesting to tag, add a hashtag, or modify a past entry (e.g., "update today breakfast as #oilfood", "add tag #chestday to my last entry", "tag my dinner as #cheatmeal"):
     - Scan the RECENT LOGS list below. Find the most recent entry matching that description (e.g. if they say "today breakfast", find the breakfast entry).
     - If a matching log is found:
       - Set "action": "update".
       - Set "update_entry_id": The exact UUID string of that matching log.
       - Append the hashtag to the existing tags of that entry, and output the combined array in the "tags" array.
       - Set "acknowledgment": "Successfully updated your entry with tag: #[tagname]" (where tagname is the tag being added).
     - If no matching log is found in the RECENT LOGS for that category/day:
       - Set "action": "insert".
       - Set "needs_clarification": false. (NEVER ask for confirmation when fallback inserting a new entry for an update request).
       - Create the log with the food/items described (e.g. "poori" for meal) and save the tag inside the "tags" array (e.g., ["poori"]).
       - Set "acknowledgment": "I couldn't find a breakfast entry for today, so I created a new breakfast log with tag: #[tagname]" (where tagname is the tag being added).`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    console.log('[serve] Received request payload:', JSON.stringify({
      text: body.text,
      userId: body.userId,
      hasDraftContext: !!body.draftContext,
      historyLength: body.history?.length || 0,
      imageUrl: body.imageUrl || 'none',
      provider: body.config?.provider
    }));

    const { text, userId = 1, draftContext = null, config, history = [], imageUrl } = body;

    if (!text || !text.trim()) {
      return new Response(JSON.stringify({ error: 'Message text is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const trimmedText = text.trim();
    const finalImageUrl = imageUrl || draftContext?.imageUrl || null;

    // ── DETERMINISTIC CONFIRMATION STATE MACHINE ──
    if (draftContext) {
      const lowerConfirm = trimmedText.toLowerCase();
      const isConfirm = ['yes', 'yeah', 'yep', 'y', 'sure', 'confirm', 'do it', 'overwrite', 'update', 'delete', 'yes please', 'do that', 'ok', 'okay'].includes(lowerConfirm);
      const isCancel = ['no', 'cancel', 'dont', 'don\'t', 'stop', 'nay', 'n', 'no thanks', 'reject'].includes(lowerConfirm);
      const isKeepBoth = ['keep both', 'add both', 'add anyway', 'keep', 'insert anyway'].includes(lowerConfirm);

      if (isConfirm || isCancel || isKeepBoth) {
        console.log(`[serve] State Machine Triggered. User reply: "${trimmedText}". isConfirm: ${isConfirm}, isCancel: ${isCancel}, isKeepBoth: ${isKeepBoth}`);
        
        // 1. Deletion Confirmation
        if (draftContext.delete_entry_ids && draftContext.delete_entry_ids.length > 0) {
          if (isConfirm) {
            const validIds = draftContext.delete_entry_ids.filter((id: string) => uuidRegex.test(id));
            if (validIds.length > 0) {
              console.log('[serve] State Machine: Deleting entries:', validIds);
              const { error } = await supabaseClient
                .from('entries')
                .delete()
                .in('id', validIds);

              if (error) {
                console.error('[serve] State Machine Deletion Error:', error.message);
                throw new Error(error.message);
              }
              return new Response(JSON.stringify({
                entry: null,
                acknowledgment: 'Successfully deleted the specified log entries.',
                needs_clarification: false,
                draftContext: null,
              }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
          } else {
            return new Response(JSON.stringify({
              entry: null,
              acknowledgment: 'Deletion cancelled.',
              needs_clarification: false,
              draftContext: null,
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
        }

        // 2. Conflict/Overwrite Confirmation
        if (draftContext.update_entry_id) {
          if (isConfirm) {
            console.log('[serve] State Machine: Overwriting entry ID:', draftContext.update_entry_id);
            const embedText = `${draftContext.category}: ${draftContext.raw_text} - Data: ${JSON.stringify(draftContext.data || {})}`;
            const embedding = await getEmbedding(embedText);

            const updatePayload: any = {
              user_id: userId,
              raw_text: draftContext.raw_text,
              category: draftContext.category,
              entry_time: draftContext.entry_time || new Date().toISOString(),
              data: draftContext.data || {},
              tags: draftContext.tags || [],
              event_date: draftContext.event_date || null
            };
            if (embedding) updatePayload.embedding = embedding;

            const { data: updated, error } = await supabaseClient
              .from('entries')
              .update(updatePayload)
              .eq('id', draftContext.update_entry_id)
              .select();

            if (error) {
              console.error('[serve] State Machine Overwrite Error:', error.message);
              throw new Error(error.message);
            }
            return new Response(JSON.stringify({
              entry: updated[0],
              acknowledgment: 'Successfully updated your existing entry.',
              needs_clarification: false,
              draftContext: null,
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

          } else if (isKeepBoth) {
            console.log('[serve] State Machine: Keeping both. Inserting new log.');
            const embedText = `${draftContext.category}: ${draftContext.raw_text} - Data: ${JSON.stringify(draftContext.data || {})}`;
            const embedding = await getEmbedding(embedText);

            const insertPayload: any = {
              user_id: userId,
              raw_text: draftContext.raw_text,
              category: draftContext.category,
              entry_time: draftContext.entry_time || new Date().toISOString(),
              data: draftContext.data || {},
              tags: draftContext.tags || [],
              event_date: draftContext.event_date || null
            };
            if (embedding) insertPayload.embedding = embedding;

            const { data: inserted, error } = await supabaseClient
              .from('entries')
              .insert([insertPayload])
              .select();

            if (error) {
              console.error('[serve] State Machine Keep Both Insert Error:', error.message);
              throw new Error(error.message);
            }
            return new Response(JSON.stringify({
              entry: inserted[0],
              acknowledgment: 'Added as a new entry.',
              needs_clarification: false,
              draftContext: null,
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

          } else {
            return new Response(JSON.stringify({
              entry: null,
              acknowledgment: 'Cancelled.',
              needs_clarification: false,
              draftContext: null,
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
        }

        // 3. Bulk Ingestion Confirmation
        if (draftContext.action === 'bulk_insert' && draftContext.bulk_entries && draftContext.bulk_entries.length > 0) {
          if (isConfirm) {
            console.log(`[serve] State Machine: Bulk inserting ${draftContext.bulk_entries.length} entries...`);
            const insertRows = [];
            const entriesToProcess = draftContext.bulk_entries.slice(0, 40);

            for (const entry of entriesToProcess) {
              const raw = entry.raw_text || `${entry.category} entry`;
              const rowTags = (raw.match(/#([a-zA-Z0-9\-_]+)/g) || []).map((t: string) => t.substring(1).toLowerCase());
              const embedPayload = `${entry.category || 'other'}: ${raw} - Data: ${JSON.stringify(entry.data || {})}`;
              const embedding = await getEmbedding(embedPayload);

              insertRows.push({
                user_id: userId,
                raw_text: raw,
                category: entry.category || 'other',
                entry_time: entry.entry_time || new Date().toISOString(),
                data: entry.data || {},
                embedding: embedding || undefined,
                tags: rowTags
              });
            }

            const { data: inserted, error } = await supabaseClient
              .from('entries')
              .insert(insertRows)
              .select();

            if (error) {
              console.error('[serve] State Machine Bulk Insert Error:', error.message);
              throw new Error(error.message);
            }

            return new Response(JSON.stringify({
              entry: inserted[0],
              acknowledgment: `Successfully imported ${inserted.length} log entries from your file!`,
              needs_clarification: false,
              draftContext: null,
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          } else {
            return new Response(JSON.stringify({
              entry: null,
              acknowledgment: 'Document import cancelled.',
              needs_clarification: false,
              draftContext: null,
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
        }
      }
      
      console.log('[serve] State Machine ignored. User typed a new logging/query instruction.');
    }

    // 1. Intent Detection (LOG vs. QUERY)
    let intent = 'LOG';
    
    if (finalImageUrl) {
      intent = 'LOG';
    } else {
      const lowerText = trimmedText.toLowerCase();
      const forceLogKeywords = ['log this message', 'log this', 'remember this', 'remember to', 'save this', 'remind me to', 'note down', 'note this', 'log it', 'remember it'];
      const hasForceLogKeyword = forceLogKeywords.some(kw => lowerText.includes(kw)) || lowerText.endsWith(' log') || lowerText.endsWith(' remember');

      if (hasForceLogKeyword) {
        intent = 'LOG';
      } else {
        const isSingleWordCategory = ['sleep', 'expense', 'expenses', 'meals', 'meal', 'mood', 'exercise', 'exercises', 'history', 'logs'].includes(lowerText);
        const relativeQueryRegex = /(today|yesterday|tomorrow|tonight|last\s+night)\s+(meal|meals|breakfast|lunch|dinner|snack|sleep|exercise|exercises|workout|warmup|gym|expense|expenses|mood|logs|history|activity|activities)/i;

        // Regex matching messages that consist ONLY of hashtags, e.g. "#poori" or "#cheatmeal #healthy"
        const onlyHashtagsRegex = /^#[a-zA-Z0-9\-_]+(\s+#[a-zA-Z0-9\-_]+)*$/;

        const queryKeywords = [
          'what should i', "what's for", 'recommend me', 'suggest', 'where did i', 'when was', 'how much', 'what was my', 'confused', 
          'sleep data', 'my sleep', 'is it good', 'is it bad', 'what else', 'show', 'list', 'get', 'tell me', 'find', 
          'did i', 'did I', 'have i', 'have I', 'summarize', 'summary', 'report', 'explain', 'what have i',
          'gather', 'give data', 'give me data', 'photo', 'picture', 'photos', 'pictures',
          'what did i have', 'what did i log', 'what did I eat', 'what was my breakfast'
        ];

        if (isSingleWordCategory || onlyHashtagsRegex.test(trimmedText) || relativeQueryRegex.test(trimmedText) || queryKeywords.some(kw => lowerText.includes(kw))) {
          intent = 'QUERY';
        } else {
          try {
            const classifierPrompt = `You are an intent classifier.
Determine if the user message is a 'LOG' instruction (saving/recording new data, e.g. 'log sleep', 'spent 300', 'remember this plan', 'note down Rahul details', 'had oats', 'ate pizza') or a 'QUERY' instruction (looking up data, requesting history/logs, general questions, single/double word lookups like 'expenses', 'today breakfast', 'today meals', 'today sleep', or requests to fetch/gather information).
Reply with exactly one word: 'LOG' or 'QUERY'.`;
            const check = await callLLM(config, classifierPrompt, trimmedText);
            intent = check.toUpperCase().includes('QUERY') ? 'QUERY' : 'LOG';
          } catch (_) {
            intent = 'LOG';
          }
        }
      }
    }
    console.log(`[serve] Resolved intent: ${intent}`);

    const timezone = 'Asia/Kolkata';

    // ── CASE A: QUERY (GENERAL ASSISTANT & RAG SEARCH) ──
    if (intent === 'QUERY') {
      let historyContext = '';
      const queryVector = await getEmbedding(trimmedText);
      const hashtags = (trimmedText.match(/#([a-zA-Z0-9\-_]+)/g) || []).map(tag => tag.substring(1).toLowerCase());
      
      // Multi-Category Targeted Router Classifier
      let targetCategories: string[] = ['meal', 'sleep', 'expense', 'mood', 'exercise', 'other'];
      try {
        const classifierPrompt = `Identify which log categories are relevant to the user query: "${trimmedText}".
Available categories: 'meal', 'sleep', 'expense', 'mood', 'exercise', 'other'.
Return ONLY a JSON array of strings containing the relevant categories, e.g. ["meal"] or ["meal", "sleep"].
If the query is a general lookup, planning, or is not category-specific, return all categories: ["meal", "sleep", "expense", "mood", "exercise", "other"].`;
        const res = await callLLM(config, classifierPrompt, trimmedText);
        let cleaned = res.trim();
        const jsonMatch = cleaned.match(/\[[\s\S]*?\]/);
        if (jsonMatch) cleaned = jsonMatch[0];
        const parsedCats = JSON.parse(cleaned);
        if (Array.isArray(parsedCats) && parsedCats.length > 0) {
          targetCategories = parsedCats;
        }
      } catch (err) {
        console.error('[serve] Targeted category classification failed:', err);
      }
      console.log('[serve] Targeted Categories:', JSON.stringify(targetCategories));

      let semanticMatches: any[] = [];
      if (queryVector) {
        const rpcParams: any = {
          query_embedding: queryVector,
          match_threshold: 0.15,
          match_count: 15,
          filter_categories: targetCategories
        };
        if (hashtags.length > 0) {
          rpcParams.filter_tags = hashtags;
        }

        const { data: matches, error: rpcErr } = await supabaseClient.rpc('match_entries', rpcParams);
        if (rpcErr) {
          console.error('[serve] match_entries RPC returned error:', rpcErr.message);
        } else if (matches) {
          semanticMatches = matches;
        }
      }

      // Load recent logs to ensure today's logs and general timeline are always present
      let recentLogs: any[] = [];
      let queryBuilder = supabaseClient
        .from('entries')
        .select('id, entry_time, category, raw_text, data, tags, event_date')
        .eq('user_id', userId)
        .in('category', targetCategories);
      
      if (hashtags.length > 0) {
        queryBuilder = queryBuilder.contains('tags', hashtags);
      }

      const { data: recentData, error: recentErr } = await queryBuilder
        .order('entry_time', { ascending: false })
        .limit(20);

      if (recentErr) {
        console.error('[serve] Failed to fetch recent fallback logs:', recentErr.message);
      } else if (recentData) {
        recentLogs = recentData;
      }

      const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
      const parts = formatter.formatToParts(new Date());
      const currentDateOnly = `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}-${parts.find(p => p.type === 'day')?.value}`;
      const todayFullStr = new Date().toLocaleString('en-US', { timeZone: timezone });

      // Load calendar events scheduled from today onwards
      let calendarEvents: any[] = [];
      const { data: calData, error: calErr } = await supabaseClient
        .from('entries')
        .select('id, entry_time, category, raw_text, data, tags, event_date')
        .eq('user_id', userId)
        .not('event_date', 'is', null)
        .gte('event_date', currentDateOnly)
        .order('event_date', { ascending: true })
        .limit(15);

      if (calErr) {
        console.error('[serve] Failed to fetch future calendar events:', calErr.message);
      } else if (calData) {
        calendarEvents = calData;
      }

      // Fetch past 30 days of entries to generate Programmatic Daily Metric summaries
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      let dailyMetricsContext = '';
      const { data: summaryData } = await supabaseClient
        .from('entries')
        .select('entry_time, category, data')
        .eq('user_id', userId)
        .gte('entry_time', thirtyDaysAgo.toISOString())
        .order('entry_time', { ascending: true });

      if (summaryData && summaryData.length > 0) {
        const dailySummaries: Record<string, { calories: number, sleep_hours: number, expense_inr: number, exercises: string[] }> = {};
        
        summaryData.forEach((row: any) => {
          const dateStr = row.entry_time.split('T')[0];
          if (!dailySummaries[dateStr]) {
            dailySummaries[dateStr] = { calories: 0, sleep_hours: 0, expense_inr: 0, exercises: [] };
          }
          const day = dailySummaries[dateStr];
          
          if (row.category === 'meal' && row.data) {
            if (row.data.nutrition?.calories) {
              day.calories += Number(row.data.nutrition.calories);
            }
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

      // Merge and deduplicate by entry ID
      const mergedMap = new Map<string, any>();
      semanticMatches.forEach((m) => mergedMap.set(m.id, m));
      recentLogs.forEach((r) => mergedMap.set(r.id, r));
      calendarEvents.forEach((c) => mergedMap.set(c.id, c));

      const mergedEntries = Array.from(mergedMap.values());
      // Sort chronologically descending
      mergedEntries.sort((a, b) => new Date(b.entry_time).getTime() - new Date(a.entry_time).getTime());

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

          return `-[Date: ${entryDateStr}] (${relativeStr})${calendarStr} [Category: ${e.category}] User logged: "${e.raw_text}" -> Structured Data: ${JSON.stringify(e.data)}`;
        }).join('\n');
      }

      const queryPrompt = `You are the user's personal Second Brain knowledge base assistant.
Answer the user's question based on their logs.

Current Date/Time: ${todayFullStr}
Current Date: ${currentDateOnly} (Timezone: ${timezone})

${dailyMetricsContext}

Strict Rules for Date-Relative Queries (CRITICAL):
1. When the user asks about "today", "yesterday", "this week", or "last week", you MUST compare the dates of the entries in the HISTORICAL DIARY LOGS with the Current Date (${currentDateOnly}).
2. If the user asks about a specific period (like "today" or "yesterday") and there are NO logs in the context matching that exact date, you MUST explicitly state that they have no logs recorded for that period. Do NOT hallucinate.
3. You can politely guide the user by adding: "You haven't logged any meals today (${currentDateOnly}), but yesterday you logged: ..."
4. If a log exists for the requested period (e.g. today) but optional details (like nutrition macros, sleep quality, or specific tags) are not present, do NOT say "You haven't logged any [category] today" in your opening sentence. Instead, state clearly what WAS logged (e.g. "You logged breakfast today: poori") and then list whatever information is available.
5. If the user asks about skipped meals or events (e.g. "when did I skip lunch?", "show skip lunch data", "skipped meals history"), search the HISTORICAL DIARY LOGS for meal entries where the "skipped" boolean field in data is true. List all such occurrences with their dates and specific meal types in a clear list or table.
6. When comparing dates or checking if an event is within a certain number of days (e.g. "in the next 10 days"), look at the relative day offset string in parentheses (e.g., "(18 days from now)" or "(3 days ago)") provided next to each entry in the HISTORICAL DIARY LOGS. Do NOT rely on your own date math; trust the relative offset string completely to determine if a log falls inside the requested timeframe.

Strict Completeness Rule (CRITICAL):
- You MUST list and describe EVERY SINGLE LOG entry that matches the requested period (e.g. today, yesterday, or a specific range) present in the HISTORICAL DIARY LOGS.
- If there are multiple entries for the same category (e.g. breakfast, skipped lunch, and a snack all under the "meal" category), you MUST list ALL of them.
- Do NOT summarize or only list the most recent one.
- Clearly distinguish each log by its specific details (e.g., meal items, meal types, sleep hours, activity duration).

Strict Context Continuation & Ellipsis Rule (CRITICAL):
- When the user asks a very short follow-up question (e.g., "yesterday", "what about yesterday?", "and dinner?", "any sleep?", "for lunch?", "show details"), they are using an ellipsis to refer back to the exact topic and category discussed in the previous turn.
- You MUST analyze the CONVERSATION HISTORY to identify what specific category, subcategory, topic, or sub-field (e.g., "breakfast" under category "meal", or "sleep hours") was being discussed in the last turn.
- You MUST then interpret their short question (e.g. "yesterday") as referring STRICTLY to that same topic/sub-field. 
- For example, if they just asked "today breakfast" and then say "yesterday", they want to see "yesterday's breakfast" ONLY. You MUST filter out all other yesterday logs (such as lunch, dinner, sleep, expenses) and only report the breakfast logs. If no breakfast was logged yesterday, explicitly state that.

Strict Source of Truth Rule (CRITICAL):
- You MUST only base your knowledge of what the user has logged on the entries listed under the "HISTORICAL DIARY LOGS" section.
- The "CONVERSATION HISTORY" section is ONLY provided to understand the conversational context (such as identifying follow-up ellipsis requests). 
- You MUST NEVER assume that any log mentioned in the "CONVERSATION HISTORY" actually exists in the database unless you also see it listed in the "HISTORICAL DIARY LOGS" section. 
- Specifically, if the user or assistant talked about creating, updating, deleting, or confirming a log in the chat history, but that log is not present in the "HISTORICAL DIARY LOGS" list, you MUST assume it was cancelled or never saved, and state that it does not exist in the records.

Strict Formatting & Presentation Guidelines (CRITICAL):
1. Distinguish between Lookup Queries and Recommendation/Analytical Queries:
   - Logging Lookup Queries (e.g., "what did I eat today?", "show logs", "list today's meals"):
     - Use the Parser Layout Style (Screenshot 2 Style): First, present a brief, parsed bulleted list describing each log (e.g., "* **A meal log for breakfast**: poori", "* **A meal log indicating that you skipped lunch**", "* **An 'other' log**: 29 July I have a test").
     - Then, below the bulleted list, present a clean Markdown table summarizing the details (e.g., columns like "Meal Type | Items | Nutrition | Skipped" or "Description | Category").
   - Recommendation, Planning, or Conversational Queries (e.g., "confused what to eat today", "what to have for dinner", "what should I eat now?", "any recommendation?"):
     - You MUST NOT output any bulleted lists of today's logs or Markdown tables unless the user explicitly requested them.
     - Instead, give a direct, friendly, and conversational response (chatting like a friend).
     - Analyze the current local time (${todayFullStr} in timezone ${timezone}) to determine which meal it is (Breakfast: 6 AM - 11 AM, Lunch: 12 PM - 3 PM, Snack: 4 PM - 6 PM, Dinner: 7 PM - 11 PM).
     - Inspect what they already logged today (e.g., they had breakfast and a snack, but skipped lunch) and cross-reference this with their HISTORICAL DIARY LOGS to see what they typically eat for the current meal slot (e.g., what they usually eat for dinner).
     - Give a personalized, friendly suggestion that complements what they ate today and aligns with their habits (e.g., "Since it's dinner time in India (10:50 PM), and you already had poori for breakfast today, I suggest a lighter dinner like chapati or soup which you usually enjoy!").
2. Strict Image Display Rule:
   - You MUST NOT embed or display images in the chat (i.e., do NOT use ![alt](url)) unless the user EXPLICITLY asks to see images, photos, or pictures in their query (e.g., "show the photo I sent today", "display the image for my breakfast").
   - If the user is just asking for general logs (e.g. "today logs"), you can simply write "(with photo attached)" in text but do NOT render/embed the image.
   - If they explicitly request images and multiple images are found, render them sequentially using standard markdown.
3. Warm & Friendly Persona:
   - Chat like a close friend and supportive personal coach. Be warm, encouraging, and feel free to use light humor or friendly wit where appropriate. Keep explanations direct and avoid dry or robotic corporate speak.
4. Avoid wordy explanations. Start with a direct, single-sentence response, followed by the formatted data.
5. Translate raw JSON data into friendly human terms (e.g., instead of displaying {"fat_g": null}, display it as not recorded or omit it).

HISTORICAL DIARY LOGS:
${historyContext || 'No past logs found.'}`;

      let userMsg = '';
      if (history && history.length > 0) {
        userMsg += `CONVERSATION HISTORY:\n` + history.map((h: any) => `${h.role === 'user' ? 'User' : 'Assistant'}: "${h.content}"`).join('\n') + `\n\n`;
      }
      userMsg += `USER MESSAGE: "${trimmedText}"`;

      const answer = await callLLM(config, queryPrompt, userMsg);
      return new Response(JSON.stringify({
        entry: null,
        acknowledgment: answer,
        needs_clarification: false,
        draftContext: null,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── CASE B: LOGGING / WRITING ACTIONS ──
    const { data: recentEntries } = await supabaseClient
      .from('entries')
      .select('id, raw_text, category, entry_time, data, tags')
      .eq('user_id', userId)
      .order('entry_time', { ascending: false })
      .limit(15); 

    const systemPrompt = buildSystemPrompt(timezone);

    let userMsg = '';
    if (history && history.length > 0) {
      userMsg += `CONVERSATION HISTORY:\n` + history.map((h: any) => `${h.role === 'user' ? 'User' : 'Assistant'}: "${h.content}"`).join('\n') + `\n\n`;
    }
    userMsg += `USER MESSAGE: "${trimmedText}"`;
    if (finalImageUrl) {
      userMsg += `\n[Attached Image Link: ${finalImageUrl}]`;
    }
    if (recentEntries && recentEntries.length > 0) {
      userMsg += `\n\nRECENT LOGS:\n` + recentEntries.map((e: any, i: number) => 
        `${i+1}. [${e.category}] Date: ${e.entry_time.split('T')[0]} | LOG_ID: ${e.id} | Raw: ${e.raw_text} | Tags: ${JSON.stringify(e.tags || [])} | Data: ${JSON.stringify(e.data)}`
      ).join('\n');
    }

    const responseText = await callLLM(config, systemPrompt, userMsg);

    let jsonStr = responseText.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    const parsed = JSON.parse(jsonStr);
    console.log('[serve] Structured LLM Parse:', JSON.stringify(parsed));

    if (parsed.delete_entry_ids) {
      parsed.delete_entry_ids = parsed.delete_entry_ids.filter((id: string) => uuidRegex.test(id));
      if (parsed.delete_entry_ids.length === 0) parsed.delete_entry_ids = null;
    }
    if (parsed.update_entry_id && !uuidRegex.test(parsed.update_entry_id)) {
      parsed.update_entry_id = null;
    }

    // ── DATABASE-LEVEL INTELLECTUAL DUPLICATE VALIDATION ──
    if (parsed.action === 'insert' && !parsed.needs_clarification) {
      const targetDate = parsed.entry_time ? parsed.entry_time.split('T')[0] : new Date().toISOString().split('T')[0];
      let conflictEntryId = null;
      let conflictDetails = '';

      if (parsed.category === 'sleep') {
        const { data: conflicts } = await supabaseClient
          .from('entries')
          .select('id, data')
          .eq('user_id', userId)
          .eq('category', 'sleep')
          .gte('entry_time', `${targetDate}T00:00:00Z`)
          .lte('entry_time', `${targetDate}T23:59:59Z`);

        if (conflicts && conflicts.length > 0) {
          conflictEntryId = conflicts[0].id;
          conflictDetails = `sleep log (${conflicts[0].data?.hours || 8} hours)`;
        }
      } else if (parsed.category === 'meal' && parsed.data?.meal_type) {
        const { data: conflicts } = await supabaseClient
          .from('entries')
          .select('id, data')
          .eq('user_id', userId)
          .eq('category', 'meal')
          .eq('data->>meal_type', parsed.data.meal_type)
          .gte('entry_time', `${targetDate}T00:00:00Z`)
          .lte('entry_time', `${targetDate}T23:59:59Z`);

        if (conflicts && conflicts.length > 0) {
          conflictEntryId = conflicts[0].id;
          conflictDetails = `meal log of type "${parsed.data.meal_type}"`;
        }
      } else {
        const embedPayload = `${parsed.category}: ${trimmedText} - Data: ${JSON.stringify(parsed.data)}`;
        const queryVector = await getEmbedding(embedPayload);

        if (queryVector) {
          const { data: matches } = await supabaseClient.rpc('match_entries', {
            query_embedding: queryVector,
            match_threshold: 0.85,
            match_count: 5,
          });

          if (matches && matches.length > 0) {
            const dateMatch = matches.find((m: any) => m.entry_time.split('T')[0] === targetDate);
            if (dateMatch) {
              conflictEntryId = dateMatch.id;
              conflictDetails = `highly similar ${parsed.category} log ("${dateMatch.raw_text}")`;
            }
          }
        }
      }

      if (conflictEntryId) {
        console.log(`[serve] Conflict intercepted programmatically: ${conflictDetails} (ID: ${conflictEntryId})`);
        
        parsed.needs_clarification = true;
        parsed.update_entry_id = conflictEntryId;
        parsed.clarification_prompt = `You already logged a ${conflictDetails} for ${targetDate}. What would you like to do?`;
        
        // Append Turn 1 variables to draftContext for the deterministic State Machine
        parsed.raw_text = trimmedText;
        parsed.entry_time = parsed.entry_time || new Date().toISOString();
        if (!parsed.tags) parsed.tags = [];

        if (finalImageUrl) {
          parsed.imageUrl = finalImageUrl;
        }

        return new Response(JSON.stringify({
          entry: null,
          acknowledgment: parsed.clarification_prompt,
          needs_clarification: true,
          draftContext: parsed,
          interactiveCard: null,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    if (parsed.needs_clarification) {
      console.log('[serve] Request needs clarification. Prompting user.');
      parsed.raw_text = trimmedText;
      parsed.entry_time = parsed.entry_time || new Date().toISOString();
      if (!parsed.tags) parsed.tags = [];
      if (finalImageUrl) {
        parsed.imageUrl = finalImageUrl;
      }
      return new Response(JSON.stringify({
        entry: null,
        acknowledgment: parsed.clarification_prompt,
        needs_clarification: true,
        draftContext: parsed,
        interactiveCard: null,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Attach image_url if present directly to entry data payload
    if (finalImageUrl) {
      if (!parsed.data) parsed.data = {};
      parsed.data.image_url = finalImageUrl;
    }

    const embedPayload = `${parsed.category}: ${trimmedText} - Data: ${JSON.stringify(parsed.data)}`;
    const embedding = await getEmbedding(embedPayload);

    const insertPayload: any = {
      user_id: userId,
      raw_text: trimmedText,
      category: parsed.category,
      entry_time: parsed.entry_time || new Date().toISOString(),
      data: parsed.data,
      tags: parsed.tags || [],
      event_date: parsed.event_date || null
    };
    if (embedding) {
      insertPayload.embedding = embedding;
    }

    if (parsed.action === 'update' && parsed.update_entry_id) {
      console.log('[serve] Updating existing entry ID:', parsed.update_entry_id);
      const { data: updated, error } = await supabaseClient
        .from('entries')
        .update(insertPayload)
        .eq('id', parsed.update_entry_id)
        .select();

      if (error) {
        console.error('[serve] Supabase database update error:', error.message);
        throw new Error(error.message);
      }

      return new Response(JSON.stringify({
        entry: updated[0],
        acknowledgment: updated[0] ? (parsed.acknowledgment || 'Entry updated successfully.') : 'No matching log found to update.',
        needs_clarification: false,
        draftContext: null,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('[serve] Inserting new log entry to database...');
    const { data: inserted, error } = await supabaseClient
      .from('entries')
      .insert([insertPayload])
      .select();

    if (error) {
      console.error('[serve] Supabase database insert error:', error.message);
      throw new Error(error.message);
    }

    return new Response(JSON.stringify({
      entry: inserted[0],
      acknowledgment: parsed.acknowledgment,
      needs_clarification: false,
      draftContext: null,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('[serve] Uncaught error in Edge Function:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
