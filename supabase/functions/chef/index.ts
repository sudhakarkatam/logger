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

function buildChefParserPrompt(timezone: string): string {
  return `You are a kitchen logging assistant. Parse the user's kitchen update into structured JSON.
Timezone: ${timezone}
Current Time: ${new Date().toLocaleString('en-US', { timeZone: timezone })}

Return ONLY a JSON object:
{
  "category": "pantry_update" | "recipe_save" | "query",
  "data": category-specific fields,
  "acknowledgment": "friendly chef reply",
  "needs_clarification": boolean,
  "clarification_prompt": string or null
}

Strict Rules:
1. Category Schemas:
   - pantry_update: { "items": [ { "name": "item_name", "qty": number, "unit": "g|pcs|L|ml", "expiry_date": "YYYY-MM-DD" | null } ] }
     - Use this when user says they bought groceries, purchased ingredients, or stocked/added items to the pantry.
     - For each item, resolve the expiration date if mentioned. Otherwise, set it to null.
   - recipe_save: { "name": "Recipe Name", "ingredients": [ { "name": "item_name", "qty": number, "unit": "g|pcs|L|ml" } ], "instructions": "string or null" }
     - Use this when user wants to save or add a recipe to their cookbook.
   - query: { "question": "user query" }
     - Use this for general culinary questions, recipe requests, or what to cook based on ingredients.`;
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
    const { text, userId = 1, draftContext = null, config, history = [] } = body;

    if (!text || !text.trim()) {
      return new Response(JSON.stringify({ error: 'Message text is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const trimmedText = text.trim();
    const timezone = 'Asia/Kolkata';
    const todayFullStr = new Date().toLocaleString('en-US', { timeZone: timezone });

    // ── DETERMINISTIC CONFIRMATION STATE MACHINE ──
    if (draftContext && draftContext.action === 'pantry_update_confirm') {
      const lowerText = trimmedText.toLowerCase();
      const isSkipOrNo = ['no', 'defaults', 'no defaults', 'use defaults', 'defaults are fine', 'nope', 'n', 'cancel'].includes(lowerText);
      
      const getIngredientExpiry = (name: string): string | null => {
        const lower = name.toLowerCase();
        const now = new Date();
        if (lower.includes('chicken') || lower.includes('meat') || lower.includes('fish') || lower.includes('shrimp')) {
          now.setDate(now.getDate() + 3);
        } else if (lower.includes('milk') || lower.includes('yogurt') || lower.includes('cheese') || lower.includes('paneer') || lower.includes('dairy')) {
          now.setDate(now.getDate() + 5);
        } else if (lower.includes('bread') || lower.includes('bun') || lower.includes('roti') || lower.includes('tortilla')) {
          now.setDate(now.getDate() + 4);
        } else if (lower.includes('spinach') || lower.includes('tomato') || lower.includes('onion') || lower.includes('vegetable') || lower.includes('potato') || lower.includes('veg') || lower.includes('fruit') || lower.includes('apple') || lower.includes('banana')) {
          now.setDate(now.getDate() + 5);
        } else if (lower.includes('egg')) {
          now.setDate(now.getDate() + 10);
        } else {
          now.setDate(now.getDate() + 365);
        }
        return now.toISOString().split('T')[0];
      };

      if (isSkipOrNo) {
        console.log('[chef] State Machine: Saving pantry items with standard defaults...');
        const itemsToInsert = draftContext.items.map((it: any) => ({
          user_id: userId,
          name: it.name,
          quantity: Number(it.qty || 1),
          unit: it.unit || 'pcs',
          expiry_date: it.expiry_date || getIngredientExpiry(it.name),
        }));

        const { error } = await supabaseClient.from('pantry').insert(itemsToInsert);
        if (error) throw new Error(error.message);

        return new Response(JSON.stringify({
          entry: null,
          acknowledgment: `Saved your items in the pantry with default expiration dates! 🍳`,
          needs_clarification: false,
          draftContext: null,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } else {
        console.log('[chef] State Machine: Resolving custom expiry dates from user reply...');
        try {
          const parserPrompt = `You are a culinary assistant.
We have a list of purchased ingredients: ${JSON.stringify(draftContext.items.map((i: any) => i.name))}
The user replied specifying custom expiration timelines: "${trimmedText}"
Current Time/Calendar Reference: ${todayFullStr}

Resolve the custom expiration date (in YYYY-MM-DD format) for each ingredient based on the user's text. If not mentioned for an item, return null for its expiry.
Return ONLY a JSON array of objects:
[
  { "name": "item_name", "expiry_date": "YYYY-MM-DD" | null }
]`;
          const parseRes = await callLLM(config, parserPrompt, trimmedText);
          let cleanedParse = parseRes.trim();
          const jsonMatch = cleanedParse.match(/\[[\s\S]*?\]/);
          if (jsonMatch) cleanedParse = jsonMatch[0];
          const parsedDates = JSON.parse(cleanedParse);
          
          const itemsToInsert = draftContext.items.map((it: any) => {
            const matched = parsedDates.find((p: any) => p.name.toLowerCase() === it.name.toLowerCase());
            return {
              user_id: userId,
              name: it.name,
              quantity: Number(it.qty || 1),
              unit: it.unit || 'pcs',
              expiry_date: (matched && matched.expiry_date) || it.expiry_date || getIngredientExpiry(it.name),
            };
          });

          const { error } = await supabaseClient.from('pantry').insert(itemsToInsert);
          if (error) throw new Error(error.message);

          const datesSummary = itemsToInsert.map((it: any) => `${it.name} (exp: ${it.expiry_date})`).join(', ');
          return new Response(JSON.stringify({
            entry: null,
            acknowledgment: `Got it! Saved items with your custom expiration dates: ${datesSummary}. 🍳`,
            needs_clarification: false,
            draftContext: null,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        } catch (e: any) {
          console.error('[chef] Failed to parse custom expiry dates:', e.message);
          const itemsToInsert = draftContext.items.map((it: any) => ({
            user_id: userId,
            name: it.name,
            quantity: Number(it.qty || 1),
            unit: it.unit || 'pcs',
            expiry_date: it.expiry_date || getIngredientExpiry(it.name),
          }));
          await supabaseClient.from('pantry').insert(itemsToInsert);
          return new Response(JSON.stringify({
            entry: null,
            acknowledgment: `Saved your items in the pantry with default expiration dates! 🍳`,
            needs_clarification: false,
            draftContext: null,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }
    }

    // ── CLASSIFY: KITCHEN LOG vs. CULINARY QUERY ──
    const parserPrompt = buildChefParserPrompt(timezone);
    const parsedText = await callLLM(config, parserPrompt, trimmedText);
    let jsonStr = parsedText.trim();
    const jsonMatch = jsonStr.match(/\{[\s\S]*?\}/);
    if (jsonMatch) jsonStr = jsonMatch[0];
    const parsed = JSON.parse(jsonStr);

    console.log('[chef] Intent detected:', parsed.category);

    if (parsed.category === 'query') {
      console.log('[chef] Executing Chef Mode RAG query...');
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
        
      const chefSystemPrompt = `You are Buddy (Master Chef & Culinary Companion), the user's personal culinary AI assistant and foodie friend.
User Name: Sudhakar (call him Buddy or Boss casually).
Origin: South India. Focus on South Indian culinary traditions when relevant (e.g. biryani, dosa, pachadi, sambar), but assist with any cuisine.
Personality: Warm, passionate about food, witty, humorous, and friendly. Use at most ONE single food emoji per recipe or paragraph (e.g. 🍳 or 🍛). NEVER group or stack multiple emojis together (e.g. NEVER write 🍕👀💆‍♀️ or 🥳🕺). Keep emoji usage clean and tasteful. Respond 100% in clean, fluent English.
Timezone: ${timezone}
Current Date/Time: ${todayFullStr}

Answer the user's question using their saved recipes and current pantry stock.
- If they ask what they can cook, inspect the expiring ingredients in their pantry stock and match them against the saved recipes.
- Suggest recipes even if they are missing up to 3-4 ingredients if the recipe has a long list of ingredients. List what ingredients are missing!
- Make suggestions friendly, enthusiastic, and full of culinary passion.
- If the user lists ingredients they have (e.g. "I have bread and eggs"), match them against their saved recipes. Suggest recipes that match some or most ingredients, mapping synonyms (like "rice" to "basmati rice") and listing what minor ingredients are missing to complete the dish.
- Do NOT talk about unrelated logs like expenses, mood, or sleep. Focus 100% on cooking, pantry, and recipes.

CURRENT KITCHEN PANTRY STOCK:
${pantryStockStr}

SAVED COOKBOOK RECIPES:
${recipesStr}`;

      let userMsg = '';
      if (history && history.length > 0) {
        userMsg += `CONVERSATION HISTORY:\n` + history.map((h: any) => `${h.role === 'user' ? 'User' : 'Assistant'}: "${h.content}"`).join('\n') + `\n\n`;
      }
      userMsg += `USER MESSAGE: "${trimmedText}"`;

      const answer = await callLLM(config, chefSystemPrompt, userMsg);
      return new Response(JSON.stringify({
        entry: null,
        acknowledgment: answer,
        needs_clarification: false,
        draftContext: null,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── KITCHEN WRITES: PANTRY STOCK UPDATE ──
    if (parsed.category === 'pantry_update') {
      const items = parsed.data?.items || [];
      if (items.length === 0) {
        return new Response(JSON.stringify({
          entry: null,
          acknowledgment: 'No items found to log to the pantry.',
          needs_clarification: false,
          draftContext: null,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const missingExpiry = items.filter((i: any) => !i.expiry_date);
      if (missingExpiry.length > 0) {
        const itemNames = missingExpiry.map((i: any) => i.name).join(', ');
        const clarificationPrompt = `I parsed your grocery purchase of ${items.map((i: any) => `${i.qty || 1}${i.unit || ''} ${i.name}`).join(', ')}. Would you like to set custom expiry dates for ${itemNames} (e.g. "milk july 24, chicken tomorrow"), or are standard defaults fine?`;
        
        return new Response(JSON.stringify({
          entry: null,
          acknowledgment: clarificationPrompt,
          needs_clarification: true,
          draftContext: {
            action: 'pantry_update_confirm',
            items: items,
            raw_text: trimmedText
          },
          interactiveCard: null,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const itemsToInsert = items.map((it: any) => ({
        user_id: userId,
        name: it.name,
        quantity: Number(it.qty || 1),
        unit: it.unit || 'pcs',
        expiry_date: it.expiry_date,
      }));

      const { error } = await supabaseClient.from('pantry').insert(itemsToInsert);
      if (error) throw new Error(error.message);

      const summary = itemsToInsert.map((i: any) => `${i.quantity}${i.unit} ${i.name} (exp: ${i.expiry_date})`).join(', ');
      return new Response(JSON.stringify({
        entry: null,
        acknowledgment: `Got it! Successfully stocked your pantry: ${summary}. 🍳`,
        needs_clarification: false,
        draftContext: null,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── KITCHEN WRITES: RECIPE BOOK SAVE ──
    if (parsed.category === 'recipe_save') {
      const name = parsed.data?.name;
      const ingredients = parsed.data?.ingredients || [];
      const instructions = parsed.data?.instructions || null;

      if (!name || ingredients.length === 0) {
        return new Response(JSON.stringify({
          entry: null,
          acknowledgment: 'Please provide a recipe name and a list of ingredients to save.',
          needs_clarification: false,
          draftContext: null,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { error } = await supabaseClient
        .from('recipes')
        .upsert({
          user_id: userId,
          name: name,
          ingredients: ingredients,
          instructions: instructions
        }, { onConflict: 'name' });

      if (error) throw new Error(error.message);

      return new Response(JSON.stringify({
        entry: null,
        acknowledgment: `Successfully saved recipe for "${name}" in your digital cookbook! 🍲`,
        needs_clarification: false,
        draftContext: null,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

  } catch (err: any) {
    console.error('[chef] Uncaught error in Edge Function:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
