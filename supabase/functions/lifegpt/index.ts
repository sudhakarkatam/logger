import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { GoogleGenAI } from "npm:@google/genai@1.0.0";
import OpenAI from "npm:openai@4.56.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

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
      throw new Error(`Anthropic error: ${err}`);
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
  const preferredProvider = config?.provider || 'gemini';
  const preferredModel = config?.model || DEFAULT_MODEL_MAP[preferredProvider] || 'gemini-2.0-flash';
  const chain = [preferredProvider, ...FALLBACK_CHAIN.filter(p => p !== preferredProvider)];

  let lastError = '';
  for (const provider of chain) {
    const apiKey = resolveApiKey(provider);
    if (!apiKey) continue;
    const model = provider === preferredProvider ? preferredModel : DEFAULT_MODEL_MAP[provider] || 'gemini-2.0-flash';
    try {
      console.log(`[callLLM] Trying provider: ${provider}, model: ${model}`);
      const result = await callLLMDirect(provider, apiKey, model, systemPrompt, userMessage);
      if (provider !== preferredProvider) {
        console.log(`[callLLM] ⚡ Served by fallback: ${provider}`);
      }
      return result;
    } catch (err: any) {
      lastError = err.message || String(err);
      console.warn(`[callLLM] ${provider} failed: ${lastError}. Trying next...`);
      continue;
    }
  }
  throw new Error(`All LLM providers failed. Last error: ${lastError}`);
}

async function getEmbedding(supabaseUrl: string, anonKey: string, text: string): Promise<number[] | null> {
  try {
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
      console.error(`[getEmbedding] embed function returned status ${res.status}`);
      return null;
    }

    const json = await res.json();
    return json.embedding || null;
  } catch (err: any) {
    console.error('[getEmbedding] Failed to fetch embedding:', err.message);
    return null;
  }
}

// Default baselines for goals
const GOAL_BASELINES: Record<string, { metric: string; target: number; period: string }> = {
  sleep: { metric: 'hours', target: 8.0, period: 'daily' },
  water: { metric: 'ml', target: 2000, period: 'daily' },
  exercise: { metric: 'count', target: 3, period: 'weekly' },
  work: { metric: 'duration_hours', target: 40.0, period: 'weekly' },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { text, userId = 1, config = {}, history = [] } = body;

    if (!text || !text.trim()) {
      return new Response(JSON.stringify({ error: 'Message text is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[lifegpt] Processing request for userId=${userId}, text="${text.substring(0, 50)}..."`);

    // 1. Gather Goals (user custom goals + fallback baselines)
    const { data: userGoals } = await supabaseClient
      .from('goals')
      .select('category, metric, target_value, period')
      .eq('user_id', userId);

    const activeGoals = { ...GOAL_BASELINES };
    if (userGoals) {
      userGoals.forEach((g: any) => {
        activeGoals[g.category] = {
          metric: g.metric,
          target: Number(g.target_value),
          period: g.period || 'daily'
        };
      });
    }

    // 2. Fetch Pantry items (limit 20, closest expiry first)
    const { data: pantryItems } = await supabaseClient
      .from('pantry')
      .select('name, quantity, unit, expiry_date')
      .eq('user_id', userId)
      .order('expiry_date', { ascending: true })
      .limit(20);

    // 3. Fetch Recipes (limit 10)
    const { data: recipes } = await supabaseClient
      .from('recipes')
      .select('name')
      .eq('user_id', userId)
      .limit(10);

    // 4. Fetch Last 10 Mood entries
    const { data: moods } = await supabaseClient
      .from('entries')
      .select('raw_text, data, entry_time')
      .eq('user_id', userId)
      .eq('category', 'mood')
      .order('entry_time', { ascending: false })
      .limit(10);

    // 5. Gather statistics (7-day and 30-day windows) using RPC call
    const statsCategories = [
      { category: 'sleep', op: 'avg', field: 'hours' },
      { category: 'expense', op: 'sum', field: 'amount' },
      { category: 'exercise', op: 'count', field: '' },
      { category: 'work', op: 'sum', field: 'duration_hours' },
      { category: 'water', op: 'sum', field: 'ml' },
      { category: 'mood', op: 'avg', field: 'intensity' },
    ];

    const stats7d: Record<string, number> = {};
    const stats30d: Record<string, number> = {};

    await Promise.all([
      ...statsCategories.map(async (sc) => {
        const { data } = await supabaseClient.rpc('get_aggregate_stats', {
          p_user_id: userId,
          p_category: sc.category,
          p_op: sc.op,
          p_field: sc.field,
          p_filter_key: '',
          p_filter_val: '',
          p_days: 7
        });
        stats7d[sc.category] = Number(data || 0);
      }),
      ...statsCategories.map(async (sc) => {
        const { data } = await supabaseClient.rpc('get_aggregate_stats', {
          p_user_id: userId,
          p_category: sc.category,
          p_op: sc.op,
          p_field: sc.field,
          p_filter_key: '',
          p_filter_val: '',
          p_days: 30
        });
        stats30d[sc.category] = Number(data || 0);
      })
    ]);

    // 6. Run RAG Vector similarity search matching user's query
    let memoriesText = "No highly relevant past memories found.";
    const queryVector = await getEmbedding(supabaseUrl, supabaseServiceKey, text);
    if (queryVector) {
      const { data: matches } = await supabaseClient.rpc('match_entries', {
        query_embedding: queryVector,
        match_threshold: 0.70,
        match_count: 8,
      });

      if (matches && matches.length > 0) {
        memoriesText = matches.map((m: any) => {
          const dateStr = new Date(m.entry_time).toLocaleDateString('en-US');
          return `- [${dateStr}] [${m.category}] ${m.raw_text}`;
        }).join('\n');
      }
    }

    // 7. Format context text block
    const goalsFormatted = Object.entries(activeGoals).map(([cat, info]) => {
      return `- **${cat}**: Target ${info.target} ${info.metric} (${info.period})`;
    }).join('\n');

    const pantryFormatted = (pantryItems && pantryItems.length > 0)
      ? pantryItems.map((p: any) => `- ${p.name}: ${p.quantity} ${p.unit} (Expires: ${p.expiry_date || 'No Expiry'})`).join('\n')
      : "No items in pantry.";

    const recipesFormatted = (recipes && recipes.length > 0)
      ? recipes.map((r: any) => `- ${r.name}`).join('\n')
      : "No recipes saved.";

    const moodsFormatted = (moods && moods.length > 0)
      ? moods.map((m: any) => {
          const intensity = m.data?.intensity ? ` (Intensity: ${m.data.intensity}/10)` : '';
          const dateStr = new Date(m.entry_time).toLocaleDateString('en-US');
          return `- [${dateStr}] ${m.raw_text}${intensity}`;
        }).join('\n')
      : "No mood entries found.";

    const coachingContext = `
=== GROUND TRUTH COACHING CONTEXT ===
USER ID: ${userId}
CURRENT TIMESTAMP: ${new Date().toLocaleString()}

ACTIVE GOALS & BASELINES:
${goalsFormatted}

LAST 7 DAYS STATISTICAL SUMMARY:
- Average Sleep: ${stats7d.sleep} hours/night
- Total Spending: ₹${stats7d.expense}
- Exercise Sessions: ${stats7d.exercise} times
- Total Work: ${stats7d.work} hours
- Total Water: ${stats7d.water} ml
- Average Mood Intensity: ${stats7d.mood}/10

LAST 30 DAYS STATISTICAL SUMMARY:
- Average Sleep: ${stats30d.sleep} hours/night
- Total Spending: ₹${stats30d.expense}
- Exercise Sessions: ${stats30d.exercise} times
- Total Work: ${stats30d.work} hours
- Total Water: ${stats30d.water} ml
- Average Mood Intensity: ${stats30d.mood}/10

PANTRY INVENTORY (Expiring first):
${pantryFormatted}

SAVED RECIPES:
${recipesFormatted}

LAST 10 MOOD ENTRIES:
${moodsFormatted}

RELEVANT DIARY MEMORIES (SEMANTIC SEARCH RESULTS):
${memoriesText}
===================================
`;

    // 8. Call LLM
const systemPrompt = `You are Buddy (Life GPT Coach), the user's ultimate personal AI coach, close friend, and witty companion.
User Name: Sudhakar (call him Buddy or Boss casually).
Origin: South India.
Personality: Warm, supportive, empathetic, witty, and humorous. Chat like a close friend and funny roommate! Use at most ONE single emoji per paragraph or section (e.g. 💡 or 🚀). NEVER stack multiple emojis together (e.g. NEVER write 🍕👀💆‍♀️ or 🥳🕺). Keep emoji usage clean, subtle, and tasteful. Respond 100% in clean, fluent English.
Your goal is to analyze the user's entire life history context and provide deeply personalized, empathetic, and data-backed coaching and insights.
Instead of answering isolated questions, look at patterns, trends, and correlations across sleep, exercise, spending, work, mood, food intake, and pantry data.

CRITICAL RULES:
1. NEVER hallucinate any statistics, numbers, or facts. Only mention numbers present in the GROUND TRUTH COACHING CONTEXT provided below.
2. If there are missing targets/goals, mention the default medical recommendations (e.g. sleep target 8h, water 2000ml, exercise 3 times/week).
3. Connect the user's current feeling or question (e.g. feeling tired) to their numbers (e.g. work hours, sleep hours, exercise frequency) and past diary logs.
4. Keep your tone direct, supportive, witty, highly action-oriented, and structured.
5. Use emojis and Markdown elements (bold text, lists, tables) to make your response visually clean and engaging.

Here is the user's life history data:
${coachingContext}
`;

    console.log(`[lifegpt] Calling LLM with persona...`);
    const chatHistory = history.map((h: any) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n');
    const userPrompt = `${chatHistory ? chatHistory + '\n' : ''}User: ${text}`;

    const llmResponse = await callLLM(config, systemPrompt, userPrompt);

    return new Response(JSON.stringify({
      entry: null, // Life GPT mode does not directly insert a log, it is a coach query mode
      acknowledgment: llmResponse,
      needs_clarification: false,
      draftContext: null
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error(`[lifegpt] Error in edge function:`, err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
