import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();

    if (!text || !text.trim()) {
      return new Response(JSON.stringify({ error: 'Text parameter is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      console.error('[embed] GEMINI_API_KEY secret not found in Supabase Vault');
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY secret is not set in your Supabase project' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Google key supports models/gemini-embedding-001. We strictly request outputDimensionality: 768 to match the entries database schema.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${geminiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: {
          parts: [{ text }],
        },
        outputDimensionality: 768
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[embed] Gemini API returned status ${res.status}: ${errText}`);
      return new Response(
        JSON.stringify({ error: `Gemini Embedding API Error: ${errText}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const json = await res.json();
    const values = json.embedding?.values || null;
    
    if (values) {
      console.log(`[embed] Successfully generated ${values.length}-dimensional vector using gemini-embedding-001`);
    } else {
      console.warn('[embed] Embedding values missing in response');
    }

    return new Response(JSON.stringify({ embedding: values }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('[embed] Uncaught error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
