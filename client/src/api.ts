import type { MessageResponse, EntriesResponse, WeekData, LLMSettings } from './types';

const SUPABASE_URL = 'https://szfjzwltuhbpobkjpobj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6Zmp6d2x0dWhicG9ia2pwb2JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2NjMwOTYsImV4cCI6MjA5OTIzOTA5Nn0.qcMhipSeeCryChFDp904tpZLjpmyjkqHqg3TGa0hEMw';

const LOCAL_SETTINGS_KEY = 'life_logger_settings';

const DEFAULT_SETTINGS = {
  provider: import.meta.env.VITE_LLM_PROVIDER || 'gemini',
  model: import.meta.env.VITE_LLM_MODEL || '',
  apiKey: '', // loaded dynamically via getEnvKey
};

const getEnvKey = (provider: string) => {
  if (provider === 'gemini') return import.meta.env.VITE_GEMINI_API_KEY || '';
  if (provider === 'groq') return import.meta.env.VITE_GROQ_API_KEY || '';
  if (provider === 'openrouter') return import.meta.env.VITE_OPENROUTER_API_KEY || '';
  if (provider === 'openai') return import.meta.env.VITE_OPENAI_API_KEY || '';
  if (provider === 'anthropic') return import.meta.env.VITE_ANTHROPIC_API_KEY || '';
  return '';
};

function getLocalSettings() {
  try {
    const raw = localStorage.getItem(LOCAL_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const provider = parsed.provider || DEFAULT_SETTINGS.provider;
      const apiKey = parsed.apiKey || getEnvKey(provider);
      return { 
        provider, 
        model: parsed.model || DEFAULT_SETTINGS.model, 
        apiKey 
      };
    }
  } catch (err) {
    console.error('[API] Error reading localStorage settings:', err);
  }
  
  const defaultProvider = DEFAULT_SETTINGS.provider;
  return {
    provider: defaultProvider,
    model: DEFAULT_SETTINGS.model,
    apiKey: getEnvKey(defaultProvider)
  };
}

function saveLocalSettings(settings: any) {
  localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(settings));
}

// ── Upload media to Supabase Storage ──
export async function uploadMedia(file: File): Promise<string> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
  
  console.log(`[API] 📷 Uploading media file: ${fileName} (${file.size} bytes)`);

  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/media/${fileName}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': file.type,
    },
    body: file,
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[API] ❌ Storage upload failed:', errText);
    throw new Error('Failed to upload image. Please try again.');
  }

  const data = await res.json();
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/media/${fileName}`;
  console.log('[API] ✅ Public URL generated:', publicUrl);
  return publicUrl;
}

// ── Send message to Supabase Edge Function ──
export async function sendMessage(text: string, userId = 1, draftContext: any = null, history: any[] = [], imageUrl?: string): Promise<MessageResponse> {
  const config = getLocalSettings();
  console.log(`[API] 💬 Sending message to Edge Function. Text: "${text}"`, {
    userId,
    hasDraftContext: !!draftContext,
    historyLength: history.length,
    imageUrl: imageUrl || 'none',
    activeProvider: config.provider,
    activeModel: config.model || 'default',
    hasApiKey: !!config.apiKey
  });

  const payload = {
    userId,
    text,
    draftContext,
    history,
    imageUrl,
    config: {
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model
    }
  };

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/message`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      console.error(`[API] ❌ Edge Function returned status ${res.status}:`, err);
      throw new Error(err.error || `Edge Function Error: ${res.status}`);
    }

    const data = await res.json();
    console.log('[API] ✅ Received Edge Function response:', data);
    return data;
  } catch (err) {
    console.error('[API] ❌ Network error in sendMessage:', err);
    throw err;
  }
}

// ── Query entries directly using Supabase REST API ──
export async function queryEntries(category?: string, limit = 50): Promise<EntriesResponse> {
  let url = `${SUPABASE_URL}/rest/v1/entries?select=*&order=entry_time.desc&limit=${limit}`;
  if (category) {
    url += `&category=eq.${category}`;
  }

  try {
    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    if (!res.ok) {
      throw new Error(`DB Query failed: ${res.statusText}`);
    }

    const data = await res.json();
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
}

// ── Fetch aggregate weekly/monthly analytics ──
export async function getWeekData(userId = 1, days = 7): Promise<WeekData> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/week?userId=${userId}&days=${days}`, {
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    }
  });

  if (!res.ok) {
    throw new Error('Failed to load dashboard statistics');
  }

  return res.json();
}

export async function getSettings(): Promise<LLMSettings> {
  const local = getLocalSettings();
  const availableProviders = [
    { id: 'gemini', name: 'Google Gemini', defaultModel: 'gemini-2.0-flash' },
    { id: 'groq', name: 'Groq (Llama)', defaultModel: 'llama-3.3-70b-versatile' },
    { id: 'openrouter', name: 'OpenRouter', defaultModel: 'openrouter/free' },
    { id: 'openai', name: 'OpenAI (GPT)', defaultModel: 'gpt-4o-mini' },
    { id: 'anthropic', name: 'Anthropic Claude', defaultModel: 'claude-3-5-haiku-latest' }
  ];

  return {
    provider: local.provider as any,
    model: local.model,
    hasApiKey: !!local.apiKey,
    availableProviders
  };
}

export async function updateSettings(provider: string, apiKey?: string, model?: string): Promise<void> {
  const current = getLocalSettings();
  const next = {
    provider,
    model: model || current.model,
    apiKey: apiKey !== undefined ? apiKey : current.apiKey
  };
  saveLocalSettings(next);
}
