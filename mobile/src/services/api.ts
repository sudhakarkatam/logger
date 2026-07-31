import AsyncStorage from '@react-native-async-storage/async-storage';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabase } from './supabase';

const LOCAL_SETTINGS_KEY = 'life_logger_settings';

export interface Entry {
  id: string;
  user_id: number;
  raw_text: string;
  category: string;
  entry_time: string;
  data: Record<string, unknown>;
  tags?: string[];
  created_at: string;
}

export interface MessageResponse {
  entry: Entry | null;
  acknowledgment: string;
  needs_clarification: boolean;
  draftContext: any | null;
  interactiveCard?: any | null;
}

export interface EntriesResponse {
  entries: Entry[];
  error?: string | null;
}

export interface WeekData {
  entries: Entry[];
  grouped: Record<string, Entry[]>;
  byDay: Record<string, Entry[]>;
  stats: {
    totalEntries: number;
    categories: { category: string; count: number }[];
    daysLogged: number;
    mostActiveCategory: string | null;
  };
  weeklyDigest?: string | null;
}

export async function getLocalSettings() {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { 
        provider: parsed.provider || 'gemini', 
        model: parsed.model || 'gemini-2.0-flash', 
      };
    }
  } catch (err) {
    console.error('[API] Error reading AsyncStorage settings:', err);
  }
  
  return {
    provider: 'gemini',
    model: 'gemini-2.0-flash',
  };
}

export async function saveLocalSettings(settings: { provider: string; model: string }) {
  try {
    await AsyncStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error('[API] Error saving AsyncStorage settings:', err);
  }
}

// ── Upload media (image base64/uri) to Supabase Storage ──
export async function uploadMedia(fileUri: string, mimeType = 'image/jpeg'): Promise<string> {
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.jpg`;
  
  try {
    const response = await fetch(fileUri);
    const blob = await response.blob();

    const { data, error } = await supabase.storage
      .from('media')
      .upload(fileName, blob, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) {
      console.warn('[API] Storage upload notice:', error.message);
      return fileUri; // Safe fallback to local URI
    }

    const { data: publicUrlData } = supabase.storage
      .from('media')
      .getPublicUrl(fileName);

    return publicUrlData?.publicUrl || `${SUPABASE_URL}/storage/v1/object/public/media/${fileName}`;
  } catch (err) {
    console.warn('[API] Storage fallback used:', err);
    return fileUri; // Fallback to local URI so messaging never breaks
  }
}

// ── Send message to Supabase Edge Function ──
export async function sendMessage(
  text: string, 
  userId = 1, 
  draftContext: any = null, 
  history: any[] = [], 
  imageUrl?: string, 
  mode?: string
): Promise<MessageResponse> {
  const config = await getLocalSettings();

  // Web API history payload format: [{ role: 'user' | 'assistant', content: string }]
  const formattedHistory = history.map(m => ({
    role: m.sender === 'user' || m.role === 'user' ? 'user' : 'assistant',
    content: m.text || m.content || ''
  }));

  const payload = {
    userId,
    text,
    draftContext,
    history: formattedHistory,
    imageUrl,
    config: {
      provider: config.provider,
      model: config.model,
      mode: mode
    }
  };

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
    throw new Error(err.error || `Edge Function Error: ${res.status}`);
  }

  const data = await res.json();
  return {
    entry: data.entry || null,
    acknowledgment: data.acknowledgment || data.response || data.message || 'Log recorded!',
    needs_clarification: data.needs_clarification || false,
    draftContext: data.draftContext || null,
    interactiveCard: data.interactiveCard || null
  };
}

// ── Query entries directly using Supabase REST API ──
export async function queryEntries(category?: string, limit = 50): Promise<EntriesResponse> {
  try {
    let query = supabase.from('entries').select('*').order('entry_time', { ascending: false }).limit(limit);
    if (category && category !== 'all') {
      query = query.eq('category', category);
    }
    const { data, error } = await query;
    if (error) throw error;
    return { entries: data || [], error: null };
  } catch (err: any) {
    return { entries: [], error: err.message };
  }
}

// ── Fetch aggregate weekly/monthly analytics ──
export async function getWeekData(userId = 1, days = 7, generateDigest = false): Promise<WeekData> {
  const config = await getLocalSettings();
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

// ── Query pantry directly (Uses correct 'pantry' table) ──
export async function queryPantry(): Promise<{ data: any[] | null, error: string | null }> {
  try {
    const { data, error } = await supabase.from('pantry').select('*').order('expiry_date', { ascending: true });
    if (error) throw error;
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
}

// ── Query recipes directly ──
export async function queryRecipes(): Promise<{ data: any[] | null, error: string | null }> {
  try {
    const { data, error } = await supabase.from('recipes').select('*').order('name', { ascending: true });
    if (error) throw error;
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: err.message };
  }
}

// ── Delete recipe ──
export async function deleteRecipe(id: number): Promise<void> {
  const { error } = await supabase.from('recipes').delete().eq('id', id);
  if (error) throw error;
}

// ── Delete pantry item ──
export async function deletePantryItem(id: number): Promise<void> {
  const { error } = await supabase.from('pantry').delete().eq('id', id);
  if (error) throw error;
}

// ── Update pantry item quantity ──
export async function updatePantryItemQuantity(id: number, qty: number): Promise<void> {
  const { error } = await supabase.from('pantry').update({ quantity: qty }).eq('id', id);
  if (error) throw error;
}

// ── Update pantry item expiry ──
export async function updatePantryItemExpiry(id: number, expiryDate: string): Promise<void> {
  const { error } = await supabase.from('pantry').update({ expiry_date: expiryDate }).eq('id', id);
  if (error) throw error;
}

// ── Delete log entry ──
export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from('entries').delete().eq('id', id);
  if (error) throw error;
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
