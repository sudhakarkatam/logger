// supabase/functions/message/synthesis.ts

import { GoogleGenAI } from "npm:@google/genai@1.0.0";
import OpenAI from "npm:openai@4.56.0";
import { getIndianDateStr, buildContextualPayload, getEmbedding, RetrievedContext } from './retriever.ts';

const timezone = 'Asia/Kolkata';

// ── API Key Resolution ──

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

// ── LLM Client Callers ──

export async function callLLMDirect(provider: string, apiKey: string, model: string, systemPrompt: string, userMessage: string): Promise<string> {
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
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.1,
  });

  return response.choices[0]?.message?.content || '';
}

export async function callLLM(
  config: { provider?: string; model?: string } | undefined,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const preferredProvider = config?.provider || 'groq';
  const preferredModel = config?.model || DEFAULT_MODEL_MAP[preferredProvider] || 'openai/gpt-oss-120b';

  const chain = [preferredProvider, ...FALLBACK_CHAIN.filter(p => p !== preferredProvider)];

  let lastError = '';
  for (const provider of chain) {
    const apiKey = resolveApiKey(provider);
    if (!apiKey) {
      console.warn(`[callLLM] No API key configured for ${provider}, skipping.`);
      continue;
    }

    const model = provider === preferredProvider ? preferredModel : DEFAULT_MODEL_MAP[provider] || 'openai/gpt-oss-120b';

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

// ── Logging System Prompt Builder ──

export function buildSystemPrompt(): string {
  const indianDate = getIndianDateStr();
  const indianTime = new Date().toLocaleString('en-US', { timeZone: timezone });

  return `You are Buddy, the user's friendly personal AI companion. Parse the user's message into structured JSON.
User Name: Sudhakar (call him Buddy or Boss in your acknowledgment).
Location: South India.
Timezone: Asia/Kolkata (Indian Standard Time - IST).
Current Indian Date: ${indianDate}
Current Indian Time (IST): ${indianTime}
Tone: Clean, articulate, warm, supportive, and friendly. Chat like a thoughtful close friend.
Emoji & Greeting Rule (STRICT): NEVER attach any emojis to the word Buddy or greetings (e.g. NEVER write '🤙 Buddy', 'Hey Buddy 🤙', 'Buddy 🫂', or 'Boss 🥞'). Do NOT use tacky or excessive emojis. Respond strictly in 100% clean, fluent English ONLY.

Return ONLY a JSON object:
{
  "category": "meal" | "mood" | "exercise" | "sleep" | "expense" | "work" | "other",
  "entry_time": ISO 8601 datetime string,
  "data": category-specific fields,
  "tags": string[] or null,
  "acknowledgment": "A warm, articulate, supportive 1-2 sentence companion reply. It MUST confirm what was logged AND include a personalized, encouraging comment or wish tailored to the content (e.g. for tired/sad mood: offer empathy and wish rest; for exercise: encourage staying active; for meals: wish a good day; for expenses/work: validate effort/value). NEVER use plain, robotic system notifications like 'Logged 1 entry' or 'I have logged your mood'. Speak like a caring friend.",
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
   - event_date (root field):
     - If the user explicitly mentions a target date (future or past relative/specific date) in their message for ANY category (e.g. 'breakfast for tomorrow', 'slept 8 hours yesterday', 'wifi bill for next Monday', '29 July I have a test', 'lunch on Friday'), you MUST resolve that date into a "YYYY-MM-DD" string and save it in the "event_date" root field.
     - Otherwise, if no specific or relative date is mentioned, set "event_date" to null.

2. Image Logging Rules:
   - Whenever an image URL is attached, ALWAYS insert the log immediately in the first turn. NEVER return needs_clarification=true on the first turn when an image is attached.
   - If the description accompanying the image is generic (e.g. "📷 Sent a photo", "test", "upload", "image"), categorize it as "other" and set acknowledgment to: "I've logged your photo. What is this photo about? (You can reply to describe it, or ignore this to do something else)."
   - If the user is describing a recently uploaded photo:
     - Set "action": "update".
     - Set "update_entry_id": The exact UUID string of that recent image entry.
     - Parse the description into its appropriate category.

3. Compound Logging & Multi-Item / Multi-Day Splits:
   - If the user mentions MULTIPLE distinct items or multi-day logs, populate 'bulk_entries' array with separate items for each date/meal.`;
}

// ── Query Synthesis ──

export async function synthesizeQueryAnswer(
  config: any,
  effectiveQuery: string,
  rerankedLogs: any[],
  retrieved: RetrievedContext,
  history: any[]
): Promise<string> {
  const rerankedContextStr = rerankedLogs.length > 0
    ? rerankedLogs.map((e: any) => {
        const entryDateStr = e.entry_time.split('T')[0];
        const d1 = new Date(retrieved.currentDateOnly + 'T00:00:00');
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
      }).join('\n')
    : retrieved.historyContext || 'No past logs found.';

  const queryPrompt = `You are the user's personal Second Brain knowledge base assistant.
Answer the user's question based on their logs.

Current Date/Time: ${retrieved.todayFullStr}
Current Date: ${retrieved.currentDateOnly} (Timezone: ${timezone})

${retrieved.aggregateStatsContext ? `${retrieved.aggregateStatsContext}\n\n` : ''}${retrieved.dailyMetricsContext}${retrieved.conditionalKitchenContext}

Strict Rules for Date-Relative Queries (CRITICAL):
1. When the user asks about "today", "yesterday", "this week", or "last week", you MUST compare the dates of the entries in the HISTORICAL DIARY LOGS with Current Date (${retrieved.currentDateOnly}).
2. If the user asks about a specific period (like "today", "yesterday", "past 2 days") and there are NO logs in the context matching that exact date range, you MUST explicitly state that they have no logs recorded for that period. Do NOT show older logs.
3. If an entry has a 'Scheduled Event Date' (event_date) matching the queried date, count it as logged for that queried date directly.
4. Completeness & Item Matching: List and describe every matching entry present in the context across all categories. When counting or searching for a specific item (e.g. oats, eggs, tea, biryani, coffee), treat all singular/plural, compound forms, and meal logs mentioning the item (e.g. 'oats', 'oat meal', 'oatmeal', 'overnight oats') as valid matching occurrences of that item. Always list ALL matching occurrences in your table or breakdown and state the exact consistent count directly.
5. Formatting Styles:
   - If user asks for cards / default: Group with markdown headers (### 🍲 Meals, ### 💻 Work, etc.).
   - If user asks for timeline: List chronologically with time pills.
   - If user asks for table / "show as table": Render a clean markdown table.
6. Persona: Chat like Buddy — articulate, warm, supportive friend. Do NOT spam emojis. Respond strictly in clean English.

HISTORICAL DIARY LOGS:
${rerankedContextStr}`;

  let userMsg = '';
  if (history && history.length > 0) {
    userMsg += `CONVERSATION HISTORY:\n` + history.slice(-8).map((h: any) => `${h.role === 'user' ? 'User' : 'Assistant'}: "${h.content}"`).join('\n') + `\n\n`;
  }
  userMsg += `USER MESSAGE: "${effectiveQuery}"`;

  return await callLLM(config, queryPrompt, userMsg);
}

// ── Chat & Auto Mood Synthesis ──

export async function synthesizeChatReply(
  config: any,
  trimmedText: string,
  history: any[],
  userId: string,
  supabaseClient: any
): Promise<string> {
  const lowerChat = trimmedText.toLowerCase();
  const strongMoodKeywords = ['sad', 'frustrated', 'depressed', 'anxious', 'stressed', 'tired', 'exhausted', 'horrible', 'feeling down'];
  const explicitMoodPhrase = /(feeling|feel|i am|i'm|my mood)\s+(good|great|happy|excited|awesome|bad|sad|tired|anxious|stressed)/i.test(lowerChat);
  const hasStrongMoodWord = strongMoodKeywords.some(m => new RegExp(`\\b${m}\\b`, 'i').test(lowerChat));

  // Auto-log mood if user expresses explicit emotion
  if (explicitMoodPhrase || hasStrongMoodWord) {
    const moodKeywords = ['bad', 'sad', 'frustrated', 'depressed', 'anxious', 'stressed', 'tired', 'exhausted', 'horrible', 'feeling down', 'great', 'happy', 'excited', 'awesome', 'good'];
    const matchedMood = moodKeywords.find(m => new RegExp(`\\b${m}\\b`, 'i').test(lowerChat)) || 'neutral';
    console.log(`[synthesizeChatReply] Auto-logging mood: "${matchedMood}"`);

    const moodEmbed = buildContextualPayload(trimmedText, 'mood', { mood: matchedMood });
    const embedding = await getEmbedding(moodEmbed);

    await supabaseClient.from('entries').insert([{
      user_id: userId,
      raw_text: trimmedText,
      category: 'mood',
      entry_time: new Date().toISOString(),
      data: { mood: matchedMood, intensity: ['bad', 'frustrated', 'sad', 'depressed', 'horrible'].includes(matchedMood) ? 8 : 7 },
      tags: [],
      embedding: embedding || undefined
    }]);
  }

  const chatPrompt = `You are Buddy, the user's friendly personal AI companion.
User Name: Sudhakar (call him Buddy or Boss).
Timezone: Asia/Kolkata (Indian Standard Time - IST).
Current Indian Date: ${getIndianDateStr()}
Tone: Clean, warm, empathetic, supportive, and natural. Speak like a real human friend.
Emoji & Greeting Rule (STRICT): NEVER attach any emojis to the word Buddy or greetings (e.g. NEVER write '🤙 Buddy', 'Hey Buddy 🤙', 'Buddy 🫂'). Do NOT use tacky or unnecessary emojis. Keep responses clean, natural, and friendly.
Context: You are having a casual conversation with Sudhakar.
Respond to his message in 1-2 friendly, conversational sentences. Do NOT ask robotic confirmation prompts like "Did you want me to log this?".`;

  let chatUserMsg = '';
  if (history && history.length > 0) {
    chatUserMsg += `CONVERSATION HISTORY:\n` + history.slice(-6).map((h: any) => `${h.role === 'user' ? 'User' : 'Assistant'}: "${h.content}"`).join('\n') + `\n\n`;
  }
  chatUserMsg += `USER MESSAGE: "${trimmedText}"`;

  return await callLLM(config, chatPrompt, chatUserMsg);
}

// ── Log Entry Structured JSON Synthesis ──

export async function synthesizeLogEntry(
  config: any,
  trimmedText: string,
  history: any[],
  recentEntries: any[],
  finalImageUrl: string | null
): Promise<any> {
  const systemPrompt = buildSystemPrompt();

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

  return JSON.parse(jsonStr);
}
