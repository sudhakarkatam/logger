import type { MessageResponse, EntriesResponse, WeekData, LLMSettings } from './types';

const SUPABASE_URL = 'https://szfjzwltuhbpobkjpobj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6Zmp6d2x0dWhicG9ia2pwb2JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2NjMwOTYsImV4cCI6MjA5OTIzOTA5Nn0.qcMhipSeeCryChFDp904tpZLjpmyjkqHqg3TGa0hEMw';

const LOCAL_SETTINGS_KEY = 'life_logger_settings';

const DEFAULT_SETTINGS = {
  provider: import.meta.env.VITE_LLM_PROVIDER || 'gemini',
  model: import.meta.env.VITE_LLM_MODEL || '',
};

function getLocalSettings() {
  try {
    const raw = localStorage.getItem(LOCAL_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const provider = parsed.provider || DEFAULT_SETTINGS.provider;
      return { 
        provider, 
        model: parsed.model || DEFAULT_SETTINGS.model, 
      };
    }
  } catch (err) {
    console.error('[API] Error reading localStorage settings:', err);
  }
  
  return {
    provider: DEFAULT_SETTINGS.provider,
    model: DEFAULT_SETTINGS.model,
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
export async function sendMessage(text: string, userId = 1, draftContext: any = null, history: any[] = [], imageUrl?: string, mode?: string): Promise<MessageResponse> {
  const config = getLocalSettings();
  console.log(`[API] 💬 Sending message to Edge Function. Text: "${text}"`, {
    userId,
    hasDraftContext: !!draftContext,
    historyLength: history.length,
    imageUrl: imageUrl || 'none',
    activeProvider: config.provider,
    activeModel: config.model || 'default',
    mode: mode || 'general'
  });

  const payload = {
    userId,
    text,
    draftContext,
    history,
    imageUrl,
    config: {
      provider: config.provider,
      model: config.model,
      mode: mode
    }
  };

  try {
    let fnName = 'message';
    if (mode === 'chef' || mode === 'pantry') fnName = 'chef';
    else if (mode === 'lifegpt') fnName = 'lifegpt';
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
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
export async function getWeekData(userId = 1, days = 7, generateDigest = false): Promise<WeekData> {
  const config = getLocalSettings();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/week`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify({
      userId,
      days,
      generateDigest,
      config: {
        provider: config.provider,
        model: config.model
      }
    })
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
    availableProviders
  };
}

export async function updateSettings(provider: string, model?: string): Promise<void> {
  const current = getLocalSettings();
  const next = {
    provider,
    model: model || current.model,
  };
  saveLocalSettings(next);
}

// ── Query pantry directly ──
export async function queryPantry(): Promise<{ data: any[] | null, error: string | null }> {
  const url = `${SUPABASE_URL}/rest/v1/pantry?select=*&order=expiry_date.asc`;
  try {
    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    if (!res.ok) throw new Error(`Pantry Query failed: ${res.statusText}`);
    const data = await res.json();
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
}

// ── Query recipes directly ──
export async function queryRecipes(): Promise<{ data: any[] | null, error: string | null }> {
  const url = `${SUPABASE_URL}/rest/v1/recipes?select=*&order=name.asc`;
  try {
    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    if (!res.ok) throw new Error(`Recipes Query failed: ${res.statusText}`);
    const data = await res.json();
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
}

// ── Delete recipe ──
export async function deleteRecipe(id: number): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/recipes?id=eq.${id}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    }
  });
  if (!res.ok) throw new Error(`Failed to delete recipe: ${res.statusText}`);
}

// ── Delete pantry item ──
export async function deletePantryItem(id: number): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/pantry?id=eq.${id}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    }
  });
  if (!res.ok) throw new Error(`Failed to delete pantry item: ${res.statusText}`);
}

// ── Update pantry item quantity ──
export async function updatePantryItemQuantity(id: number, qty: number): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/pantry?id=eq.${id}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ quantity: qty })
  });
  if (!res.ok) throw new Error(`Failed to update quantity: ${res.statusText}`);
}

// ── Update pantry item expiry ──
export async function updatePantryItemExpiry(id: number, expiryDate: string): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/pantry?id=eq.${id}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ expiry_date: expiryDate })
  });
  if (!res.ok) throw new Error(`Failed to update expiry date: ${res.statusText}`);
}

// ── Test connection to LLM using Supabase Env Secrets ──
export async function testConnection(provider: string, model?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({ provider, model })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Connection failed' }));
      return { success: false, error: err.error || `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { success: data.success, error: data.error };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

// ── Fetch timeline entries with filters ──
export async function getTimelineEntries(
  userId = 1,
  startDate?: string,
  endDate?: string,
  categories?: string[],
  searchQuery?: string
): Promise<EntriesResponse> {
  let url = `${SUPABASE_URL}/rest/v1/entries?select=id,user_id,raw_text,category,entry_time,data,tags,created_at&order=entry_time.desc&user_id=eq.${userId}`;
  
  if (startDate) {
    url += `&entry_time=gte.${startDate}`;
  }
  if (endDate) {
    const endStr = endDate.includes('T') ? endDate : `${endDate}T23:59:59.999Z`;
    url += `&entry_time=lte.${endStr}`;
  }
  if (categories && categories.length > 0) {
    url += `&category=in.(${categories.join(',')})`;
  }
  if (searchQuery) {
    url += `&raw_text=ilike.*${encodeURIComponent(searchQuery)}*`;
  }

  try {
    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    if (!res.ok) {
      throw new Error(`Timeline query failed: ${res.statusText}`);
    }

    const data = await res.json();
    return { entries: data };
  } catch (err: any) {
    console.error('[API] Error in getTimelineEntries:', err);
    return { entries: [] };
  }
}

// ── Delete entry ──
export async function deleteEntry(id: string): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/entries?id=eq.${id}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    }
  });
  if (!res.ok) throw new Error(`Failed to delete entry: ${res.statusText}`);
}



