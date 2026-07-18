import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { GoogleGenAI } from "npm:@google/genai@1.0.0";
import OpenAI from "npm:openai@4.56.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

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

// ── LLM Client Caller ──
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const url = new URL(req.url);
    let userId = 1;
    let days = 7;
    let generateDigest = false;
    let config = null;

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      userId = parseInt(body.userId || '1');
      days = parseInt(body.days || '7');
      generateDigest = !!body.generateDigest;
      config = body.config || null;
    } else {
      userId = parseInt(url.searchParams.get('userId') || '1');
      days = parseInt(url.searchParams.get('days') || '7');
      generateDigest = url.searchParams.get('generateDigest') === 'true';
    }

    console.log(`[week] Fetching week data: userId=${userId}, days=${days}, generateDigest=${generateDigest}`);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Fetch entries excluding the massive 'embedding' vector column for high-speed delivery
    const { data: entries, error } = await supabaseClient
      .from('entries')
      .select('id, user_id, raw_text, category, entry_time, data, tags, created_at')
      .eq('user_id', userId)
      .gte('entry_time', cutoffDate.toISOString())
      .order('entry_time', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    // Group entries by category
    const grouped: Record<string, any[]> = {};
    entries.forEach((entry: any) => {
      if (!grouped[entry.category]) {
        grouped[entry.category] = [];
      }
      grouped[entry.category].push({
        id: entry.id,
        user_id: entry.user_id,
        raw_text: entry.raw_text,
        category: entry.category,
        entry_time: entry.entry_time,
        data: entry.data,
        tags: entry.tags,
        created_at: entry.created_at
      });
    });

    // Group entries by day
    const byDay: Record<string, any[]> = {};
    entries.forEach((entry: any) => {
      const day = (entry.entry_time || new Date().toISOString()).split('T')[0];
      if (!byDay[day]) {
        byDay[day] = [];
      }
      byDay[day].push({
        id: entry.id,
        user_id: entry.user_id,
        raw_text: entry.raw_text,
        category: entry.category,
        entry_time: entry.entry_time,
        data: entry.data,
        tags: entry.tags,
        created_at: entry.created_at
      });
    });

    // Compute summary stats
    const stats = {
      totalEntries: entries.length,
      categories: Object.keys(grouped).map(cat => ({
        category: cat,
        count: grouped[cat].length,
      })),
      daysLogged: Object.keys(byDay).length,
      mostActiveCategory: Object.keys(grouped).sort(
        (a, b) => grouped[b].length - grouped[a].length
      )[0] || null,
    };

    // ── GENERATE WEEKLY/MONTHLY DIGEST VIA LLM ──
    let weeklyDigest: string | null = null;

    if (generateDigest && config) {
      console.log('[week] Building on-demand digest prompt...');
      
      // Programmatic Calculations
      let totalExpense = 0;
      let totalSleep = 0;
      let sleepCount = 0;
      let totalWorkHours = 0;
      let exerciseCount = 0;
      let totalMoodIntensity = 0;
      let moodCount = 0;
      let mealsCount = 0;
      let booksCount = 0;
      let totalWaterMl = 0;

      entries.forEach((e: any) => {
        if (e.category === 'expense' && e.data?.amount) {
          totalExpense += Number(e.data.amount);
        }
        if (e.category === 'sleep' && e.data?.hours) {
          totalSleep += Number(e.data.hours);
          sleepCount++;
        }
        if (e.category === 'work' && e.data?.duration_hours) {
          totalWorkHours += Number(e.data.duration_hours);
        }
        if (e.category === 'exercise') {
          if (e.data?.skipped !== true && e.data?.activity !== 'rest day') {
            exerciseCount++;
          }
        }
        if (e.category === 'mood' && e.data?.intensity) {
          totalMoodIntensity += Number(e.data.intensity);
          moodCount++;
        }
        if (e.category === 'meal') {
          mealsCount++;
        }
        if (e.category === 'book' || (e.tags && e.tags.includes('book'))) {
          booksCount++;
        }
        if (e.category === 'water' && e.data?.ml) {
          totalWaterMl += Number(e.data.ml);
        }
      });

      const avgSleep = sleepCount > 0 ? (totalSleep / sleepCount).toFixed(1) : '0.0';
      const avgMood = moodCount > 0 ? (totalMoodIntensity / moodCount).toFixed(1) : '0.0';

      const formattedLogs = entries.map((e: any) => {
        const dateStr = e.entry_time.split('T')[0];
        return `-[${dateStr}] [${e.category.toUpperCase()}] Logged: "${e.raw_text}" -> Data: ${JSON.stringify(e.data)}`;
      }).join('\n');

      const digestPrompt = `You are a supportive, warm, and highly witty personal health coach and funny roommate.
Analyze the user's logs for the past ${days} days and write a beautiful digest.

Timeline Period: Past ${days} days
Current Time: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}

Pre-Calculated Metrics (CRITICAL: You MUST use these exact numbers and MUST NOT compute or hallucinate them):
- Total Expenses Logged: ₹${totalExpense}
- Average Sleep Hours: ${avgSleep} hours
- Total Work Hours: ${totalWorkHours} hours
- Exercise Count: ${exerciseCount} sessions
- Average Mood Rating: ${avgMood}/10
- Meals Logged: ${mealsCount} meals
- Books Read: ${booksCount} books
- Water Intake: ${totalWaterMl} ml

Here are the user's logs for this period:
${formattedLogs || 'No logs recorded.'}

Strict Guidelines for the Digest:
1. Header: Start directly with "📬 Weekly Health & Expense Digest" (if period is 7 days) or "📬 Monthly Health & Expense Digest" (if 30+ days).
2. Metrics Summary Section:
   - Present the exact Pre-Calculated metrics provided above.
   - Compare expenses against the baseline budget (₹2,800 for 7 days, or ₹12,000 for 30 days) with a celebratory emoji or witty remark. Compare average sleep against the 8-hour target. Compare exercise against the target (3 sessions for weekly, 12 sessions for monthly).
3. Coach Insight & Correlation (CRITICAL):
   - Look closely at all categories (meals, sleep, mood, exercise, expenses, work, water, books).
   - Find interesting, funny, or helpful correlations (e.g. "You work longer on days with poor sleep", "You skip exercise when work exceeds 8 hours", "Your mood average drops on high-work/low-exercise weeks", "You drink enough water only on exercise days").
   - Offer a witty, encouraging roommate-style advice. Keep it concise, fun, and extremely engaging. Use emojis.
4. Formatting: Write in clean, beautiful Markdown. Keep explanations direct and avoid extra conversational filler around the digest itself.`;

      try {
        console.log('[week] Calling LLM client for digest...');
        weeklyDigest = await callLLM(config, digestPrompt, "Generate my digest.");
        console.log('[week] Digest generated successfully.');
      } catch (err: any) {
        console.error('[week] LLM call failed:', err.message);
        weeklyDigest = `⚠️ Could not generate digest: ${err.message}`;
      }
    }

    return new Response(JSON.stringify({ 
      entries: entries.map((e: any) => ({
        id: e.id,
        user_id: e.user_id,
        raw_text: e.raw_text,
        category: e.category,
        entry_time: e.entry_time,
        data: e.data,
        tags: e.tags,
        created_at: e.created_at
      })), 
      grouped, 
      byDay, 
      stats,
      weeklyDigest
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
