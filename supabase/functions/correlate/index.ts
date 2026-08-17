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
  groq: 'openai/gpt-oss-120b',
  groq2: 'openai/gpt-oss-120b',
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
    temperature: 0.1, // low temperature for structured tasks
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
      const result = await callLLMDirect(provider, apiKey, model, systemPrompt, userMessage);
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { text, userId = 1, config = {} } = body;

    if (!text || !text.trim()) {
      return new Response(JSON.stringify({ error: 'Question text is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[correlate] Extracting variables for: "${text}"`);

    // 1. LLM classifier to extract variables into JSON
    const classifierPrompt = `You are a data analyst assistant. Parse the user's question about correlation between two life log habits and extract them into a structured JSON.
Possible categories are: 'meal', 'expense', 'sleep', 'exercise', 'work', 'water', 'mood', 'other'.
Possible target fields: 'hours' (for sleep), 'amount' (for expense), 'duration_hours' (for work), 'ml' (for water), 'intensity' (for mood).

Examples:
Question: "does coffee affect my sleep?"
Result: {
  "source_category": "meal",
  "source_filter": "coffee",
  "target_category": "sleep",
  "target_field": "hours",
  "days": 30
}

Question: "do I spend more on days I feel stressed?"
Result: {
  "source_category": "mood",
  "source_filter": "stressed",
  "target_category": "expense",
  "target_field": "amount",
  "days": 30
}

Question: "how does morning gym help my sleep?"
Result: {
  "source_category": "exercise",
  "source_filter": "gym",
  "target_category": "sleep",
  "target_field": "hours",
  "days": 30
}

Return ONLY the raw JSON object. Do not wrap it in markdown code blocks or add any other text.`;

    const extractionResult = await callLLM(config, classifierPrompt, text);
    console.log(`[correlate] Raw extraction:`, extractionResult);

    let extracted: any;
    try {
      extracted = JSON.parse(extractionResult.trim().replace(/^```json|```$/g, ''));
    } catch (parseErr) {
      throw new Error(`Failed to parse LLM extraction output: ${extractionResult}`);
    }

    console.log(`[correlate] Calling compare_categories RPC with:`, extracted);

    // 2. Call SQL compare_categories RPC
    const { data: dbResult, error: dbError } = await supabaseClient.rpc('compare_categories', {
      p_user_id: userId,
      p_source_category: extracted.source_category,
      p_source_filter: extracted.source_filter,
      p_target_category: extracted.target_category,
      p_target_field: extracted.target_field,
      p_days: extracted.days || 30
    });

    if (dbError) {
      throw new Error(`Database error: ${dbError.message}`);
    }

    console.log(`[correlate] RPC response:`, dbResult);

    // 3. Format response using LLM
    const explainerPrompt = `You are a supportive, warm, and highly analytical health coach.
Explain the database correlation findings to the user.

User Question: "${text}"
Extracted Variables:
- Habit Category: ${extracted.source_category} (${extracted.source_filter})
- Target Field: ${extracted.target_category} (${extracted.target_field})
- Analysis Period: ${extracted.days || 30} days

Database Result:
${JSON.stringify(dbResult)}

Strict Guidelines:
1. Explain the results in a friendly, conversational way.
2. Directly answer if there is a correlation based on the averages provided.
3. Compare the average values and note the sample size (number of days).
4. Use emojis.
5. Do not invent any numbers. Only use the numbers in the database result.
`;

    const explanation = await callLLM(config, explainerPrompt, "Explain the correlation findings.");

    return new Response(JSON.stringify({
      success: true,
      analysis: extracted,
      result: dbResult,
      explanation
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error(`[correlate] Error:`, err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
