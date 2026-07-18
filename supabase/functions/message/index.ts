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

// ── API Key Resolution (from Supabase Edge Function Secrets) ──

const ENV_KEY_MAP: Record<string, string> = {
  gemini: 'GEMINI_API_KEY',
  groq: 'GROQ_API_KEY',
  groq2: 'GROQ_API_KEY_2',
  openrouter: 'OPENROUTER_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
};

const DEFAULT_MODEL_MAP: Record<string, string> = {
  gemini: 'gemini-2.0-flash',
  groq: 'llama-3.3-70b-versatile',
  groq2: 'llama-3.3-70b-versatile',
  openrouter: 'openrouter/free',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-latest',
};

const FALLBACK_CHAIN = ['groq', 'groq2', 'openrouter', 'gemini'];

function resolveApiKey(provider: string): string {
  const envVar = ENV_KEY_MAP[provider];
  if (!envVar) return '';
  return Deno.env.get(envVar) || '';
}

// ── LLM Client Callers ──

async function callLLMDirect(provider: string, apiKey: string, model: string, systemPrompt: string, userMessage: string): Promise<string> {
  if (provider === 'gemini') {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: userMessage,
      config: { systemInstruction: systemPrompt },
    });
    return response.text || '';
  }

  let baseURL = 'https://api.openai.com/v1';
  if (provider === 'groq' || provider === 'groq2') baseURL = 'https://api.groq.com/openai/v1';
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
        model,
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
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.3,
  });
  return completion.choices[0].message.content || '';
}

async function callLLM(config: any, systemPrompt: string, userMessage: string): Promise<string> {
  const preferredProvider = config.provider || 'gemini';
  const preferredModel = config.model || DEFAULT_MODEL_MAP[preferredProvider] || 'gemini-2.0-flash';

  // Build fallback chain: preferred provider first, then remaining providers
  const chain = [preferredProvider, ...FALLBACK_CHAIN.filter(p => p !== preferredProvider)];

  let lastError = '';
  for (const provider of chain) {
    const apiKey = resolveApiKey(provider);
    if (!apiKey) {
      console.warn(`[callLLM] No API key configured for ${provider}, skipping.`);
      continue;
    }

    const model = provider === preferredProvider ? preferredModel : DEFAULT_MODEL_MAP[provider] || 'gemini-2.0-flash';

    try {
      console.log(`[callLLM] Trying provider: ${provider}, model: ${model}`);
      const result = await callLLMDirect(provider, apiKey, model, systemPrompt, userMessage);
      if (provider !== preferredProvider) {
        console.log(`[callLLM] ⚡ Served by fallback provider: ${provider} (${preferredProvider} was unavailable)`);
      }
      return result;
    } catch (err: any) {
      lastError = err.message || String(err);
      console.warn(`[callLLM] ${provider} failed: ${lastError}. Trying next provider...`);
      continue;
    }
  }

  throw new Error(`All LLM providers failed. Last error: ${lastError}`);
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
  return `You are Buddy, the user's friendly personal AI companion. Parse the user's message into structured JSON.
User Name: Sudhakar (call him Buddy or Boss in your acknowledgment).
Location: South India.
Tone: Warm, conversational, humorous, witty, and friendly. Chat like a funny roommate and supportive close friend!
Emoji Rule (STRICT): Use at most ONE single emoji per sentence (e.g. 🥞 or ☕). NEVER stack or group multiple emojis together (e.g. NEVER write 🍕👀💆‍♀️ or 🥳🕺). Keep emoji usage clean and tasteful. Respond strictly and 100% in clean, fluent English ONLY.
Timezone: ${timezone}
Current Time: ${new Date().toLocaleString('en-US', { timeZone: timezone })}

Return ONLY a JSON object:
{
  "category": "meal" | "mood" | "exercise" | "sleep" | "expense" | "work" | "other",
  "entry_time": ISO 8601 datetime string,
  "data": category-specific fields,
  "tags": string[] or null,
  "acknowledgment": "friendly reply confirmation",
  "needs_clarification": boolean,
  "clarification_prompt": string or null,
  "action": "insert" | "update" | "delete" | "cancel" | "bulk_insert",
  "bulk_entries": [
    {
      "category": "meal" | "mood" | "exercise" | "sleep" | "expense" | "work" | "other",
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
     - For the subcategory field: map wifi bills, current bills, electricity bills, water charges, mobile phone bills, house rents, gas bills, or any bill/utilities to "bills". Map dining out, restaurant, lunch starters, snacks, coffee, tea, biryani, or online food orders to "food".
   - mood: { "mood": "happy|sad|tired|anxious|neutral", "intensity": 1-10 }
   - exercise: { "activity": "running|walking|gym", "duration_minutes": number, "distance_km": number|null }
   - work: { "description": "what work was done", "project": "project/topic name or null", "duration_hours": number | null }
     - If the user logs just "work", "worked", or "log work" without any detail, set description to "Software Laptop Work" and duration_hours to null.
     - Extract duration in hours if specified (e.g., "worked for 5 hours" -> 5, "spent 1.5 hours in meeting" -> 1.5).
     - If they specify details (e.g., "worked on coding", "work on slide deck", "meeting with client"), extract the description specifically.
   - other: { "description": "text summary" }
     - Use this category for general knowledge, reminders, plans, pending tasks, learning goals, or any facts/statements the user wants to remember.
     - Clean the description to remove trigger phrases like "remember this", "log this", "log it", "save this", or "remind me to" from the final stored description.
   - query: { "question": "user natural language query" }
     - If the user asks a question about their logs (e.g., "what did I eat yesterday", "how much did I spend last week", "did I exercise on 29 july"), use this category.
   - event_date (root field):
     - If the user explicitly mentions a target date (future or past relative/specific date) in their message for ANY category (e.g. 'breakfast for tomorrow', 'slept 8 hours yesterday', 'wifi bill for next Monday', '29 July I have a test', 'lunch on Friday'), you MUST resolve that date into a "YYYY-MM-DD" string (using the Current Time calendar anchor reference) and save it in the "event_date" root field of the returned JSON object.
     - This applies to ALL categories (meals, sleep, mood, expenses, exercise, other, query).
     - Otherwise, if no specific or relative date is mentioned, set "event_date" to null.

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
       - Set "acknowledgment": "I couldn't find a breakfast entry for today, so I created a new breakfast log with tag: #[tagname]" (where tagname is the tag being added).

7. Casual Exclamations & Conversational Safety (CRITICAL):
   - If the user's message is a casual reaction, exclamation, conversational remark, or feedback/agreement (e.g., "ooh that is remainder", "nice", "makes sense", "thanks", "ok", "correct", "wow") and does NOT contain any new metrics, food, sleep hours, or reminders they explicitly asked you to remember, you MUST NOT save it directly.
   - Instead, set "needs_clarification": true.
   - Set "clarification_prompt": "I noticed you said '[user text]'. Did you want me to log this as a reminder/note, or is it just a comment?"

8. Compound Logging & Multi-Item Splits (CRITICAL - MUST FOLLOW):
   - If the user mentions MULTIPLE distinct loggable items in a SINGLE message, you MUST NOT combine them into one entry.
   - This applies to:
     a) Multiple expenses: "750 for wifi bill and 180 for lunch starters" → 2 expense entries
     b) Multiple meal types: "had poori for breakfast, rice for lunch, chapati for dinner" → 3 separate meal entries (one per meal_type)
     c) Mixed categories: "had dosa for breakfast, spent 200 on uber, slept 7 hours" → 3 entries (meal + expense + sleep)
     d) Any combination of the above
   - For ALL these cases, set "action": "bulk_insert" and populate "bulk_entries" array with one entry per distinct log.
   - Each bulk_entries item MUST have its own "category", "entry_time", "data" (with correct category-specific fields), and "raw_text".
   - For meals specifically: each meal type (breakfast/lunch/dinner/snack) is a SEPARATE entry with its own nutrition estimates.
   - The acknowledgment should list everything in a friendly, witty way: "Logged breakfast (dosa), ₹200 uber expense, and 7h sleep separately! 🍲💳😴"
   - NEVER merge multiple meal types or mixed categories into a single entry. breakfast ≠ lunch ≠ dinner ≠ snack.

9. Ambiguous Logging Verification (CRITICAL Doubt-Buster):
   - If a message contains data (numbers, metrics, foods, expenses, sleep hours) but DOES NOT use an explicit action or logging verb (such as "spent", "paid", "log", "remember", "save", "ate", "had", "slept", "ran", "walked"), you MUST NOT save it directly in the first turn.
   - Instead, you MUST flag it for confirmation: set "needs_clarification": true, set "clarification_prompt" to a confirmation question (e.g. "I noticed you mentioned '[raw text]'. Did you want me to log this, or is it just a comment?"), and save the parsed log in the "draftContext" (with correct action e.g. "insert" or "bulk_insert").
   - You are ONLY allowed to save directly in the first turn if the user explicitly uses one of the logging action verbs (e.g. "spent 50 on banana", "log 6 hours sleep", "had oats for breakfast").`;
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
      let isConfirm = false;
      let isCancel = false;
      let isKeepBoth = false;
      let isNewCommand = false;

      try {
        const confirmPrompt = `You are a conversation state assistant.
The user was asked a confirmation question: "${draftContext.clarification_prompt || 'Are you sure?'}"
The user replied: "${trimmedText}"

Classify the user's reply into one of the following categories:
- 'confirm': The user is agreeing, confirming, saying yes, or instructing to overwrite/update/delete (e.g., "yes", "overwrite", "do it", "delete it", "yeah", "do that", "confirm").
- 'keep_both': The user wants to keep both entries, add it anyway, or insert it as a duplicate (e.g., "add this also", "add both", "add anyway", "keep both", "insert anyway", "add soda also", "add it anyway", "add this").
- 'cancel': The user is denying, cancelling, or saying no (e.g., "no", "cancel", "dont", "no thanks").
- 'new_command': The user is ignoring the confirmation and typing a completely new logging request, query, or topic (e.g., "slept 8 hours", "what did I spend yesterday?", "hello").

Return ONLY one of these four strings: 'confirm', 'keep_both', 'cancel', or 'new_command'.`;

        const decisionText = await callLLM(config, confirmPrompt, trimmedText);
        const decision = decisionText.trim().toLowerCase();
        console.log('[serve] State Machine LLM Decision:', decision);

        if (decision.includes('confirm')) isConfirm = true;
        else if (decision.includes('keep_both')) isKeepBoth = true;
        else if (decision.includes('cancel')) isCancel = true;
        else if (decision.includes('new_command')) isNewCommand = true;
      } catch (err) {
        console.error('[serve] LLM confirmation classification failed, falling back to static keywords:', err);
        const lowerConfirm = trimmedText.toLowerCase();
        isConfirm = ['yes', 'yeah', 'yep', 'y', 'sure', 'confirm', 'do it', 'overwrite', 'update', 'delete', 'yes please', 'do that', 'ok', 'okay'].includes(lowerConfirm);
        isCancel = ['no', 'cancel', 'dont', 'don\'t', 'stop', 'nay', 'n', 'no thanks', 'reject'].includes(lowerConfirm);
        isKeepBoth = ['keep both', 'add both', 'add anyway', 'keep', 'insert anyway'].includes(lowerConfirm);
      }

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
      const hasForceLogKeyword = forceLogKeywords.some(kw => lowerText.includes(kw));

      if (hasForceLogKeyword) {
        intent = 'LOG';
      } else {
        const queryKeywords = [
          'today logs', 'today\'s logs', 'todays logs', 'show logs', 'my logs', 'recent logs', 'all logs', 'get logs', 'view logs', 'log history',
          'show', 'display', 'list', 'what', 'how', 'when', 'where', 'did i', 'have i', 'history', 'summary', 'report', 'tell me',
          'what did i', 'show me', 'list my', 'get my', 'view my', 'check my', 'find my', 'any logs', 'my entries'
        ];
        const isQueryPhrase = queryKeywords.some(kw => lowerText.includes(kw));
        const isSingleWordCategory = ['sleep', 'expense', 'expenses', 'meals', 'meal', 'mood', 'exercise', 'exercises', 'history', 'logs', 'log'].includes(lowerText);
        const onlyHashtagsRegex = /^#[a-zA-Z0-9\-_]+(\s+#[a-zA-Z0-9\-_]+)*$/;

        if (isQueryPhrase || isSingleWordCategory || onlyHashtagsRegex.test(trimmedText)) {
          intent = 'QUERY';
        } else {
          try {
            const classifierPrompt = `You are an intent classifier.
Classify the user message: "${trimmedText}"
${history && history.length > 0 ? `\nRecent conversation context:\n${history.slice(-4).map((h: any) => `${h.role}: "${h.content}"`).join('\n')}\n` : ''}

CRITICAL RULES:
- If the user is asking to view, list, check, summarize, or ask questions about their logs or history (e.g. "today logs", "show today logs", "what did I eat", "how much did I spend", "my sleep", "yesterday?"), classify STRICTLY as 'QUERY'.
- ONLY classify as 'LOG' if the user is explicitly telling you to record, save, add, or remember new data points, metrics, activities, notes, or reminders (e.g. "ate oats for breakfast", "spent 100 on groceries", "slept 8 hours").

Reply with exactly one word: 'LOG' or 'QUERY'.`;
            const check = await callLLM(config, classifierPrompt, trimmedText);
            const res = check.toUpperCase();
            if (res.includes('LOG') && !res.includes('QUERY')) {
              intent = 'LOG';
            } else {
              intent = 'QUERY';
            }
          } catch (_) {
            intent = 'QUERY';
          }
        }
      }
    }
    console.log(`[serve] Resolved intent: ${intent}`);

    const timezone = 'Asia/Kolkata';

    // ── CASE A: QUERY (GENERAL ASSISTANT & RAG SEARCH) ──
    if (intent === 'QUERY') {
      const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
      const parts = formatter.formatToParts(new Date());
      const currentDateOnly = `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}-${parts.find(p => p.type === 'day')?.value}`;
      const todayFullStr = new Date().toLocaleString('en-US', { timeZone: timezone });



      // Check if it is a quantitative query requiring database-side math aggregation
      let aggregateStatsContext = '';
      const isQuantitativeQuery = /(how\s+(many|much)|total|average|avg|sum\s+of|frequency\s+of|how\s+often)/i.test(trimmedText);

      if (isQuantitativeQuery) {
        console.log('[serve] Quantitative query detected. Running DB aggregate classifier...');
        try {
          const parserPrompt = `You are a query parsing assistant. Analyze this user query: "${trimmedText}"
Current Time/Calendar Reference: ${todayFullStr}

Extract the quantitative database query parameters as a JSON object:
{
  "category": "meal" | "sleep" | "expense" | "mood" | "exercise" | "work" | "other",
  "op": "count" | "sum" | "avg",
  "field": string | null,       -- name of JSON key in data object to calculate math on (e.g. 'amount' for expense, 'hours' for sleep, 'calories' for nutrition calories, or null for simple counts)
  "filter_key": string | null,  -- JSON key inside data object to filter by (e.g., 'meal_type' for meals, 'subcategory' for expenses, 'activity' for exercises, 'skipped' for skipped meals)
  "filter_val": string | null,  -- value of that JSON key (e.g., 'breakfast' for meal_type, 'food' for subcategory, 'running' for activity, 'true' or 'false' for skipped)
  "days": number                -- number of days to look back (default to 30 if timeframe is unclear, 365 for past year, 7 for past week, 1 for yesterday/today, etc.)
}

Return ONLY this JSON object. Do not include markdown code block formatting or explanations.`;

          const parseRes = await callLLM(config, parserPrompt, trimmedText);
          let cleanedParse = parseRes.trim();
          const jsonMatch = cleanedParse.match(/\{[\s\S]*?\}/);
          if (jsonMatch) cleanedParse = jsonMatch[0];

          const parsedParams = JSON.parse(cleanedParse);
          console.log('[serve] Parsed Quantitative Params:', JSON.stringify(parsedParams));

          if (parsedParams.category && parsedParams.op) {
            const { data: statsVal, error: statsErr } = await supabaseClient.rpc('get_aggregate_stats', {
              p_user_id: userId,
              p_category: parsedParams.category,
              p_op: parsedParams.op,
              p_field: parsedParams.field || null,
              p_filter_key: parsedParams.filter_key || null,
              p_filter_val: parsedParams.filter_val !== null ? String(parsedParams.filter_val) : null,
              p_days: parsedParams.days || 30
            });

            if (statsErr) {
              console.error('[serve] get_aggregate_stats RPC error:', statsErr.message);
            } else {
              console.log('[serve] get_aggregate_stats RPC returned:', statsVal);
              const opName = parsedParams.op === 'sum' ? 'Total sum' : (parsedParams.op === 'avg' ? 'Average' : 'Total count');
              const fieldLabel = parsedParams.field ? ` of ${parsedParams.field}` : '';
              const filterLabel = parsedParams.filter_key ? ` (filtered by ${parsedParams.filter_key} = ${parsedParams.filter_val})` : '';

              aggregateStatsContext = `AGGREGATE DATABASE CALCULATIONS SUMMARY (100% MATHEMATICALLY ACCURATE):
- Metric: ${opName}${fieldLabel}${filterLabel} over the past ${parsedParams.days} days
- Exact Computed Value: ${statsVal}
- Instruction: Use this exact value as the absolute ground-truth for your response. Do not hallucinate or try to count or recalculate it yourself.
- Formatting Override (CRITICAL): If the timeframe is large (7+ days) or the number of entries is high (more than 15 items), you MUST NOT list individual logs or draw a table detailing every individual log, UNLESS the user explicitly asks you in their query to list, show, or display the entries. Otherwise, simply give a direct conversational answer showing the final calculated number. If they ask for a breakdown, summarize only by high-level groups, but never print a long list of individual transactions.`;
              console.log('[serve] Aggregate stats injected successfully:', statsVal);
            }
          }
        } catch (err) {
          console.error('[serve] Failed to parse/execute quantitative query:', err);
        }
      }

      let historyContext = '';
      const queryVector = await getEmbedding(trimmedText);
      const hashtags = (trimmedText.match(/#([a-zA-Z0-9\-_]+)/g) || []).map(tag => tag.substring(1).toLowerCase());

      // Multi-Category Targeted Router Classifier
      let targetCategories: string[] = ['meal', 'sleep', 'expense', 'mood', 'exercise', 'work', 'other'];
      const lowerQuery = trimmedText.toLowerCase();
      const isGeneralQuery = ['log', 'logs', 'history', 'everything', 'all', 'summary', 'summarize', 'report', 'show all', 'list all'].some(kw => lowerQuery.includes(kw));

      if (isGeneralQuery) {
        console.log('[serve] General query keyword matched. Bypassing router.');
      } else {
        try {
          const classifierPrompt = `Identify which log categories are relevant to the user query: "${trimmedText}".
Available categories: 'meal', 'sleep', 'expense', 'mood', 'exercise', 'work', 'other'.
Return ONLY a JSON array of strings containing the relevant categories, e.g. ["meal"] or ["meal", "sleep"].
If the query is a general lookup, planning, or is not category-specific, return all categories: ["meal", "sleep", "expense", "mood", "exercise", "work", "other"].`;
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

      // Date formatter variables are declared at the start of Case A QUERY block.

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
            } else {
              detailsStr = e.raw_text;
            }
          } else {
            detailsStr = e.raw_text;
          }

          return `-[Date: ${entryDateStr}] (${relativeStr})${calendarStr} [Category: ${e.category}] Text: "${e.raw_text}" | Summary: ${detailsStr}`;
        }).join('\n');
      }

      // Conditional Recipes & Pantry loading in general mode
      const isRecipeOrPantryQuery = /(recipe|pantry|cook|fridge|kitchen|ingredient|stock)/i.test(trimmedText);
      let conditionalKitchenContext = '';

      if (isRecipeOrPantryQuery) {
        console.log('[serve] Loading conditional kitchen context in general mode...');
        const { data: pantryStock } = await supabaseClient
          .from('pantry')
          .select('name, quantity, unit, expiry_date')
          .eq('user_id', userId)
          .order('expiry_date', { ascending: true });

        const { data: recipes } = await supabaseClient
          .from('recipes')
          .select('name, ingredients, instructions')
          .eq('user_id', userId);

        const pantryStockStr = pantryStock && pantryStock.length > 0
          ? pantryStock.map((p: any) => `- "${p.name}": ${p.quantity} ${p.unit} (Expires: ${p.expiry_date || 'No Expiry'})`).join('\n')
          : 'Pantry is empty.';

        const recipesStr = recipes && recipes.length > 0
          ? recipes.map((r: any) => `- "${r.name}": Requires ${JSON.stringify(r.ingredients)}. Instructions: ${r.instructions || 'None'}`).join('\n')
          : 'No recipes saved in your cookbook.';

        conditionalKitchenContext = `\n\nCONDITIONAL KITCHEN & COOKBOOK CONTEXT (Only answer using this if user asks about cooking, ingredients, recipes, or pantry):
CURRENT PANTRY STOCK:
${pantryStockStr}

SAVED RECIPES:
${recipesStr}`;
      }

      const queryPrompt = `You are the user's personal Second Brain knowledge base assistant.
Answer the user's question based on their logs.

Current Date/Time: ${todayFullStr}
Current Date: ${currentDateOnly} (Timezone: ${timezone})

${aggregateStatsContext ? `${aggregateStatsContext}\n\n` : ''}${dailyMetricsContext}${conditionalKitchenContext}

Strict Rules for Date-Relative Queries (CRITICAL):
1. When the user asks about "today", "yesterday", "this week", or "last week", you MUST compare the dates of the entries in the HISTORICAL DIARY LOGS with the Current Date (${currentDateOnly}).
2. If the user asks about a specific period (like "today", "yesterday", "past 2 days", or "this week") and there are NO logs in the context matching that exact date range, you MUST explicitly state that they have no logs recorded for that period. Do NOT show or fall back to any logs from older dates outside the requested period.
3. You MUST strictly respect the timeline boundaries of the user's query. If the user asks about "the past 2 days only", "today", or "yesterday", you are forbidden from displaying, referencing, or building tables for any logs older than that period (e.g. if today is 2026-07-14, do not show logs from 2026-07-11 or 2026-07-10). If no data exists for those days, simply state: "You haven't logged any [category/meal] data for today (YYYY-MM-DD) or yesterday (YYYY-MM-DD)."
4. If a log exists for the requested period (e.g. today) but optional details (like nutrition macros, sleep quality, or specific tags) are not present, do NOT say "You haven't logged any [category] today" in your opening sentence. Instead, state clearly what WAS logged (e.g. "You logged breakfast today: poori") and then list whatever information is available.
5. If the user asks about skipped meals or events (e.g. "when did I skip lunch?", "show skip lunch data", "skipped meals history"), search the HISTORICAL DIARY LOGS for meal entries where the "skipped" boolean field in data is true. List all such occurrences with their dates and specific meal types in a clear list or table.
6. When comparing dates or checking if an event is within a certain number of days (e.g. "in the next 10 days"), look at the relative day offset string in parentheses (e.g., "(18 days from now)" or "(3 days ago)") provided next to each entry in the HISTORICAL DIARY LOGS. Do NOT rely on your own date math; trust the relative offset string completely to determine if a log falls inside the requested timeframe.
7. Expense Subcategory Calculations (CRITICAL):
   - If the user asks for expense totals of a specific subcategory (e.g., 'outside food', 'eating out', 'bills', 'wifi bills', 'travel/transport') for a timeframe (e.g. this week or this month):
     - Filter the HISTORICAL DIARY LOGS for 'expense' entries that fit that time range.
     - Intelligently map their request to the stored subcategory or descriptions (e.g., wifi bill and electricity are 'bills'; lunch starters and restaurants are 'food').
     - Mathematically sum up their amounts and display the total in INR (e.g., "Total bills this week: ₹1,200 (₹750 wifi + ₹450 electricity)"). Do NOT hallucinate. Show the math step-by-step and list each contributing transaction.
8. Scheduled / Target Date Rule (CRITICAL):
   - If an entry has a 'Scheduled Event Date' (event_date) matching the queried date (e.g. today ${currentDateOnly}), you MUST treat and count it as logged for that queried date directly, even if the entry's original entry_time date was in the past (e.g. logged yesterday).
   - Do NOT tell the user "You haven't logged any breakfast data for today" if a scheduled entry exists for today; report it directly as today's log.

Strict Completeness Rule (CRITICAL):
- You MUST list and describe EVERY SINGLE LOG entry that matches the requested period (e.g. today, yesterday, or a specific range) present in the HISTORICAL DIARY LOGS.
- If there are multiple entries for the same category (e.g. breakfast, skipped lunch, and a snack all under the "meal" category), you MUST list ALL of them.
- Do NOT summarize or only list the most recent one.
- Clearly distinguish each log by its specific details (e.g., meal items, meal types, sleep hours, activity duration).

Strict Formatting & Presentation Guidelines (CRITICAL):
1. Distinguish between Lookup Queries and Recommendation/Analytical Queries:
   - Logging Lookup Queries (e.g., "what did I eat today?", "show logs", "list today's meals"):
     - Use clean human Markdown bullet points (e.g., "* **Breakfast**: 3 poori", "* **Lunch**: Skipped", "* **Snack**: Bonda").
     - NEVER output raw JSON blobs, curly braces `{ }`, or raw string labels like ` -> Data: { "items": ["poori"] } `.
     - Below the bulleted list, present a clean Markdown table summarizing the details (e.g., columns like `Meal Type | Items | Status`).
   - Recommendation, Planning, or Conversational Queries (e.g., "confused what to eat today", "what to have for dinner"):
     - Do NOT output tables unless requested. Give a direct, friendly response.
2. Warm, Humorous & Friendly Persona — Buddy:
   - Chat like a close friend, supportive coach, and witty roommate with a great sense of humor!
   - Emoji Rule (STRICT): Use at most ONE single emoji per bullet point or sentence (e.g. 🥞 or ☕). NEVER group or stack multiple emojis together (e.g. NEVER write 🍕👀💆‍♀️ or 🥳🕺 or 🍿😂). Keep emoji usage clean and subtle.
   - Respond strictly in 100% clean, fluent English.
3. Translate raw data into friendly human terms (e.g. display skipped meals cleanly as "Skipped").

HISTORICAL DIARY LOGS:
${historyContext || 'No past logs found.'}`;

      let userMsg = '';
      if (history && history.length > 0) {
        userMsg += `CONVERSATION HISTORY:\n` + history.slice(-8).map((h: any) => `${h.role === 'user' ? 'User' : 'Assistant'}: "${h.content}"`).join('\n') + `\n\n`;
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
      userMsg += `CONVERSATION HISTORY:\n` + history.slice(-8).map((h: any) => `${h.role === 'user' ? 'User' : 'Assistant'}: "${h.content}"`).join('\n') + `\n\n`;
    }
    userMsg += `USER MESSAGE: "${trimmedText}"`;
    if (finalImageUrl) {
      userMsg += `\n[Attached Image Link: ${finalImageUrl}]`;
    }
    if (recentEntries && recentEntries.length > 0) {
      userMsg += `\n\nRECENT LOGS:\n` + recentEntries.map((e: any, i: number) =>
        `${i + 1}. [${e.category}] Date: ${e.entry_time.split('T')[0]} | LOG_ID: ${e.id} | Raw: ${e.raw_text} | Tags: ${JSON.stringify(e.tags || [])} | Data: ${JSON.stringify(e.data)}`
      ).join('\n');
    }

    const responseText = await callLLM(config, systemPrompt, userMsg);

    let jsonStr = responseText.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    const parsed = JSON.parse(jsonStr);
    console.log('[serve] Structured LLM Parse:', JSON.stringify(parsed));

    // ── PROGRAMMATIC DOUBT-BUSTER GUARD ──
    const explicitLoggingVerbs = [
      'spent', 'paid', 'bought', 'cost', 'costs', 'purchase', 'purchased', 'buy',
      'ate', 'had', 'drank', 'ordered', 'eating', 'drinking',
      'slept', 'sleep', 'sleeping',
      'ran', 'walked', 'exercised', 'gym', 'workout', 'jog', 'jogged', 'swam', 'jogging', 'walking', 'running',
      'log', 'save', 'remember', 'note', 'record', 'add', 'create', 'write',
      'work', 'worked'
    ];
    const hasExplicitVerb = explicitLoggingVerbs.some(verb => {
      const regex = new RegExp(`\\b${verb}\\b`, 'i');
      return regex.test(trimmedText);
    });

    if (intent === 'LOG' && !finalImageUrl && !hasExplicitVerb && !parsed.needs_clarification) {
      console.log(`[serve] Programmatic Doubt-Buster triggered: No explicit logging verb in "${trimmedText}".`);
      parsed.needs_clarification = true;
      parsed.clarification_prompt = `I noticed you mentioned '${trimmedText}'. Did you want me to log this, or is it just a comment?`;
    }

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

    if (parsed.action === 'bulk_insert' && parsed.bulk_entries && parsed.bulk_entries.length > 0) {
      console.log(`[serve] Direct Bulk Inserting ${parsed.bulk_entries.length} entries...`);
      const insertRows = [];
      for (const entry of parsed.bulk_entries) {
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
          tags: rowTags,
          event_date: entry.event_date || null
        });
      }

      const { data: inserted, error } = await supabaseClient
        .from('entries')
        .insert(insertRows)
        .select();

      if (error) {
        console.error('[serve] Database direct bulk insert error:', error.message);
        throw new Error(error.message);
      }

      return new Response(JSON.stringify({
        entry: inserted[0],
        acknowledgment: parsed.acknowledgment || `Successfully logged ${inserted.length} separate items.`,
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
