import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
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

function resolveApiKey(provider: string): string {
  const envVar = ENV_KEY_MAP[provider];
  if (!envVar) return '';
  return Deno.env.get(envVar) || '';
}

async function testProviderConnection(provider: string, model: string): Promise<void> {
  const apiKey = resolveApiKey(provider);
  if (!apiKey) {
    throw new Error(`API key secret (${ENV_KEY_MAP[provider] || provider}) is not configured on Supabase.`);
  }

  const testPrompt = "Hello! Please reply with exactly one word: 'Connected'.";

  if (provider === 'gemini') {
    const ai = new GoogleGenAI({ apiKey });
    await ai.models.generateContent({
      model,
      contents: testPrompt,
    });
    return;
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
        max_tokens: 10,
        messages: [{ role: 'user', content: testPrompt }],
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic error: ${err}`);
    }
    return;
  }

  const client = new OpenAI({ apiKey, baseURL });
  await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: testPrompt }],
    max_tokens: 10,
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const provider = body.provider || 'gemini';
    const model = body.model || DEFAULT_MODEL_MAP[provider] || 'gemini-2.0-flash';

    console.log(`[test-connection] Testing provider=${provider}, model=${model}`);
    await testProviderConnection(provider, model);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error(`[test-connection] Test failed:`, err);
    return new Response(JSON.stringify({ success: false, error: err.message || String(err) }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
