// ── Entry from the database ──
export interface Entry {
  id: string;
  user_id: number;
  raw_text: string;
  category: Category;
  entry_time: string;
  data: Record<string, unknown>;
  tags?: string[];
  created_at: string;
}

export type Category = 'meal' | 'mood' | 'exercise' | 'sleep' | 'expense' | 'other';

// ── Category-specific data shapes ──
export interface MealData {
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  items: string[];
  calories?: number | null;
}

export interface MoodData {
  mood: string;
  intensity: number;
  notes?: string;
}

export interface ExerciseData {
  activity: string;
  duration_minutes?: number | null;
  distance_km?: number | null;
  intensity?: 'light' | 'moderate' | 'intense';
}

export interface SleepData {
  hours: number;
  quality?: 'good' | 'fair' | 'poor' | null;
  notes?: string;
}

export interface ExpenseData {
  amount: number;
  currency: string;
  description: string;
  subcategory?: string;
}

export interface InteractiveCard {
  type: 'duplicate_resolver';
  category: Category;
  date: string;
  message: string;
  options: {
    label: string;
    textValue: string;
    actionValue: 'insert' | 'update' | 'cancel';
    style?: 'primary' | 'secondary' | 'danger';
  }[];
}

// ── Chat UI types ──
export interface ChatMessage {
  id: string;
  type: 'user' | 'system';
  text: string;
  timestamp: string;
  category?: Category;
  entry?: Entry;
  imageUrl?: string;
  interactiveCard?: InteractiveCard | null;
}

// ── Week summary ──
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

// ── Settings ──
export type Provider = 'gemini' | 'groq' | 'openrouter' | 'openai' | 'anthropic';

export interface ProviderInfo {
  id: Provider;
  defaultModel: string;
  envVar: string;
  hasEnvKey: boolean;
}

export interface LLMSettings {
  provider: Provider;
  model: string;
  hasApiKey: boolean;
  availableProviders: ProviderInfo[];
}

// ── API response types ──
export interface MessageResponse {
  entry: Entry | null;
  acknowledgment: string;
  needs_clarification: boolean;
  draftContext: any | null;
  interactiveCard?: InteractiveCard | null;
}

export interface EntriesResponse {
  entries: Entry[];
}

// ── Category metadata ──
export const CATEGORY_META: Record<Category, { icon: string; label: string; color: string }> = {
  meal:     { icon: '🍽️', label: 'Meal',     color: 'var(--cat-meal)' },
  mood:     { icon: '😊', label: 'Mood',     color: 'var(--cat-mood)' },
  exercise: { icon: '🏃', label: 'Exercise', color: 'var(--cat-exercise)' },
  sleep:    { icon: '😴', label: 'Sleep',    color: 'var(--cat-sleep)' },
  expense:  { icon: '💰', label: 'Expense',  color: 'var(--cat-expense)' },
  other:    { icon: '📝', label: 'Other',    color: 'var(--cat-other)' },
};
