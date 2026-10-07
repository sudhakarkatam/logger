export type Category = 'meal' | 'mood' | 'exercise' | 'sleep' | 'expense' | 'water' | 'reminder' | 'work' | 'book' | 'other';

export interface CategoryMeta {
  icon: string;
  label: string;
  prefix: string;
  color: string;
}

export const CATEGORY_CHIPS: { category: Category; prefix: string; label: string; icon: string }[] = [
  { category: 'meal', prefix: 'log meal: ', label: '🍲 Meals', icon: '🍽️' },
  { category: 'expense', prefix: 'log expense: ', label: '💳 Spendings', icon: '💰' },
  { category: 'sleep', prefix: 'log sleep: ', label: '😴 Sleep', icon: '😴' },
  { category: 'exercise', prefix: 'log exercise: ', label: '🏃 Exercise', icon: '🏃' },
  { category: 'mood', prefix: 'log mood: ', label: '🧠 Mood', icon: '😊' },
  { category: 'water', prefix: 'log water: ', label: '💧 Water', icon: '💧' },
  { category: 'reminder', prefix: 'log reminder: ', label: '⏰ Reminders', icon: '⏰' },
  { category: 'work', prefix: 'log work: ', label: '💻 Work', icon: '💻' },
  { category: 'book', prefix: 'log book: ', label: '📚 Books', icon: '📚' },
  { category: 'other', prefix: 'log note: ', label: '💡 Notes', icon: '📝' },
];

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  meal:     { icon: '🍽️', label: 'Meal',     prefix: 'log meal: ',     color: '#FF914D' },
  mood:     { icon: '😊', label: 'Mood',     prefix: 'log mood: ',     color: '#C084FC' },
  exercise: { icon: '🏃', label: 'Exercise', prefix: 'log exercise: ', color: '#60A5FA' },
  sleep:    { icon: '😴', label: 'Sleep',    prefix: 'log sleep: ',    color: '#A78BFA' },
  expense:  { icon: '💰', label: 'Expense',  prefix: 'log expense: ',  color: '#34D399' },
  water:    { icon: '💧', label: 'Water',    prefix: 'log water: ',    color: '#38BDF8' },
  reminder: { icon: '⏰', label: 'Reminder', prefix: 'log reminder: ', color: '#FBBF24' },
  work:     { icon: '💻', label: 'Work',     prefix: 'log work: ',     color: '#818CF8' },
  book:     { icon: '📚', label: 'Book',     prefix: 'log book: ',     color: '#F472B6' },
  other:    { icon: '📝', label: 'Other',    prefix: 'log note: ',     color: '#9CA3AF' },
};

export const DEFAULT_PRESETS: Record<string, string[]> = {
  meal: ['Idli Dosa ☕', 'Rice & Dal 🍛', 'Biryani 🍗'],
  expense: ['Tea & Snacks ☕', 'Groceries 🛒', 'Auto/Uber 🚗'],
  sleep: ['7h Sleep 🛌', '8h Restful Sleep 😴', '6h Tired Sleep 🥱'],
  exercise: ['5K Run 🏃', 'Gym Workout 🏋️', 'Walk 🚶'],
  mood: ['Happy 😊', 'Energetic 💪', 'Tired 🥱'],
  water: ['500ml Water 💧', '1L Bottle 🥛', 'Glass of Water 🥤'],
  reminder: ['Drink Water 💧', 'Take Meds 💊', 'Call Mom 📞'],
  work: ['Laptop Work 💻', 'Software Dev ⚙️', 'Meeting 📅'],
  book: ['Finished Chapter 📖', 'Started New Book 📚', 'Audiobook Session 🎧'],
  other: ['Study 📚', 'Water Plants 🪴', 'Read Book 📖'],
};

export type Provider = 'gemini' | 'groq' | 'openrouter' | 'openai' | 'anthropic';

export const QUICK_MODELS: Record<Provider, { id: string; label: string; free: boolean }[]> = {
  groq: [
    { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', free: true },
    { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B', free: true },
    { id: 'gemma2-9b-it', label: 'Gemma 2 9B', free: true },
    { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B', free: true },
  ],
  gemini: [
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', free: true },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', free: true },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', free: false },
  ],
  openrouter: [
    { id: 'google/gemini-2.0-flash-exp:free', label: 'Gemini 2.0 Flash', free: true },
    { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B', free: true },
    { id: 'deepseek/deepseek-chat-v3-0324:free', label: 'DeepSeek V3', free: true },
    { id: 'qwen/qwen-2.5-72b-instruct:free', label: 'Qwen 2.5 72B', free: true },
    { id: 'mistralai/mistral-7b-instruct:free', label: 'Mistral 7B', free: true },
  ],
  openai: [
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini', free: false },
    { id: 'gpt-4o', label: 'GPT-4o', free: false },
  ],
  anthropic: [
    { id: 'claude-3-5-haiku-latest', label: 'Claude Haiku', free: false },
    { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', free: false },
  ],
};

export const PROVIDER_DISPLAY: Record<Provider, string> = {
  groq: 'Groq',
  gemini: 'Gemini',
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};

export const PROVIDER_HINTS: Record<Provider, string> = {
  gemini: 'Set GEMINI_API_KEY in your Supabase Edge Function Secrets. Models: gemini-2.0-flash, gemini-2.5-pro.',
  groq: 'Set GROQ_API_KEY in your Supabase Edge Function Secrets. Models: llama-3.3-70b-versatile, etc.',
  openrouter: 'Set OPENROUTER_API_KEY in your Supabase Edge Function Secrets. Allows free models.',
  openai: 'Set OPENAI_API_KEY in your Supabase Edge Function Secrets.',
  anthropic: 'Set ANTHROPIC_API_KEY in your Supabase Edge Function Secrets.',
};
