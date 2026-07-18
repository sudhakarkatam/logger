import { useState, useEffect } from 'react';
import { getSettings, updateSettings, testConnection, queryEntries } from '../api';
import type { Provider, LLMSettings } from '../types';

const PROVIDER_LABELS: Record<Provider, string> = {
  gemini: 'Google Gemini',
  groq: 'Groq',
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  anthropic: 'Anthropic Claude',
};

const PROVIDER_HINTS: Record<Provider, string> = {
  gemini: 'Set GEMINI_API_KEY in your Supabase Edge Function Secrets. Models: gemini-2.0-flash, gemini-2.5-pro.',
  groq: 'Set GROQ_API_KEY in your Supabase Edge Function Secrets. Models: llama-3.3-70b-versatile, etc.',
  openrouter: 'Set OPENROUTER_API_KEY in your Supabase Edge Function Secrets. Allows free models.',
  openai: 'Set OPENAI_API_KEY in your Supabase Edge Function Secrets.',
  anthropic: 'Set ANTHROPIC_API_KEY in your Supabase Edge Function Secrets.',
};

const POPULAR_MODELS: Record<Provider, string[]> = {
  gemini: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash-8b'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it', 'mixtral-8x7b-32768'],
  openrouter: [
    'google/gemini-2.0-flash-exp:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'deepseek/deepseek-chat-v3-0324:free',
    'qwen/qwen-2.5-72b-instruct:free',
    'mistralai/mistral-7b-instruct:free',
    'google/gemini-2.5-pro-exp-03-25:free',
    'openrouter/auto',
  ],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'o4-mini'],
  anthropic: ['claude-3-5-haiku-latest', 'claude-sonnet-4-20250514', 'claude-3-5-sonnet-latest'],
};

export default function SettingsPanel() {
  const [settings, setSettings] = useState<LLMSettings | null>(null);
  const [provider, setProvider] = useState<Provider>('gemini');
  const [model, setModel] = useState('');
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // Custom Presets
  const [presetMeal, setPresetMeal] = useState('');
  const [presetExpense, setPresetExpense] = useState('');
  const [presetSleep, setPresetSleep] = useState('');
  const [presetExercise, setPresetExercise] = useState('');
  const [presetMood, setPresetMood] = useState('');
  const [presetWater, setPresetWater] = useState('');
  const [presetReminder, setPresetReminder] = useState('');
  const [presetWork, setPresetWork] = useState('');
  const [presetBook, setPresetBook] = useState('');
  const [presetNote, setPresetNote] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await getSettings();
      setSettings(data);
      setProvider(data.provider);
      setModel(data.model);

      const popularForProvider = POPULAR_MODELS[data.provider] || [];
      const isCustom = data.model && !popularForProvider.includes(data.model);
      setIsCustomModel(!!isCustom);

      const rawPresets = localStorage.getItem('life_logger_custom_presets');
      if (rawPresets) {
        const parsed = JSON.parse(rawPresets);
        setPresetMeal(parsed.meal || '');
        setPresetExpense(parsed.expense || '');
        setPresetSleep(parsed.sleep || '');
        setPresetExercise(parsed.exercise || '');
        setPresetMood(parsed.mood || '');
        setPresetWater(parsed.water || '');
        setPresetReminder(parsed.reminder || '');
        setPresetWork(parsed.work || parsed.idea || '');
        setPresetBook(parsed.book || '');
        setPresetNote(parsed.other || '');
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  const handleProviderChange = (newProvider: Provider) => {
    setProvider(newProvider);
    const info = settings?.availableProviders.find(p => p.id === newProvider);
    const defaultModel = info ? info.defaultModel : '';
    setModel(defaultModel);
    
    const popularForProvider = POPULAR_MODELS[newProvider] || [];
    const isCustom = defaultModel && !popularForProvider.includes(defaultModel);
    setIsCustomModel(!!isCustom);
  };

  const handleModelDropdownChange = (value: string) => {
    if (value === 'custom') {
      setIsCustomModel(true);
    } else {
      setIsCustomModel(false);
      setModel(value);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setSaveMessage('⏳ Testing connection to provider...');
    try {
      const res = await testConnection(provider, model || undefined);
      if (res.success) {
        setSaveMessage(`✅ Connection successful! Model responded correctly.`);
      } else {
        setSaveMessage(`❌ Connection failed: ${res.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      setSaveMessage(`❌ Error: ${err.message || String(err)}`);
    } finally {
      setTesting(false);
    }
  };

  const handleExport = async (format: 'json' | 'csv') => {
    try {
      setExporting(true);
      setSaveMessage('⏳ Preparing data export...');
      const res = await queryEntries(undefined, 5000);
      if (!res.data || res.data.length === 0) {
        setSaveMessage('❌ No entries found to export.');
        return;
      }

      let fileContent = '';
      let mimeType = 'text/plain';
      let fileName = 'life_logger_export';

      if (format === 'json') {
        fileContent = JSON.stringify(res.data, null, 2);
        mimeType = 'application/json';
        fileName += '.json';
      } else {
        const headers = ['id', 'entry_time', 'category', 'raw_text', 'tags', 'data'];
        const csvRows = [headers.join(',')];

        res.data.forEach((e: any) => {
          const values = [
            e.id,
            e.entry_time,
            e.category,
            `"${(e.raw_text || '').replace(/"/g, '""')}"`,
            `"${(e.tags || []).join(',')}"`,
            `"${JSON.stringify(e.data || {}).replace(/"/g, '""')}"`
          ];
          csvRows.push(values.join(','));
        });

        fileContent = csvRows.join('\n');
        mimeType = 'text/csv';
        fileName += '.csv';
      }

      const blob = new Blob([fileContent], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setSaveMessage('✅ Data exported successfully!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err: any) {
      console.error(err);
      setSaveMessage(`❌ Export failed: ${err.message || String(err)}`);
    } finally {
      setExporting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage('');
    try {
      await updateSettings(
        provider,
        model || undefined
      );

      const presetsObj = {
        meal: presetMeal,
        expense: presetExpense,
        sleep: presetSleep,
        exercise: presetExercise,
        mood: presetMood,
        water: presetWater,
        reminder: presetReminder,
        work: presetWork,
        book: presetBook,
        other: presetNote,
      };
      localStorage.setItem('life_logger_custom_presets', JSON.stringify(presetsObj));

      setSaveMessage('✅ Settings saved!');
      await loadSettings();
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err) {
      setSaveMessage(`❌ ${err instanceof Error ? err.message : 'Save failed'}`);
    } finally {
      setSaving(false);
    }
  };

  const popularModels = POPULAR_MODELS[provider] || [];
  const dropdownValue = isCustomModel ? 'custom' : model;

  return (
    <div className="settings-viewport">
      <h3 className="settings-box-title">⚙️ Configuration</h3>

      <div className="settings-form">
        {/* Provider selection */}
        <div className="form-row">
          <label className="form-label">LLM Provider</label>
          <select
            id="settings-provider"
            className="form-select"
            value={provider}
            onChange={e => handleProviderChange(e.target.value as Provider)}
          >
            {Object.entries(PROVIDER_LABELS).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
          <span className="form-help">{PROVIDER_HINTS[provider]}</span>
        </div>

        {/* Model Dropdown */}
        <div className="form-row">
          <label className="form-label">Model Selection</label>
          <select
            className="form-select"
            value={dropdownValue}
            onChange={e => handleModelDropdownChange(e.target.value)}
          >
            {popularModels.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
            <option value="custom">✏️ Custom Model...</option>
          </select>
          <span className="form-help">Select from popular models or type a custom name.</span>
        </div>

        {/* Custom Model Text Input (Only visible when Custom selected) */}
        {isCustomModel && (
          <div className="form-row">
            <label className="form-label">Custom Model Name</label>
            <input
              id="settings-model"
              className="form-input"
              type="text"
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder="e.g. gemini-1.5-pro-latest"
            />
            <span className="form-help">Type the exact API model identifier string.</span>
          </div>
        )}

        {/* Test Connection Button */}
        <div className="form-row" style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '16px' }}>
          <button
            type="button"
            className="form-select"
            onClick={handleTestConnection}
            disabled={testing}
            style={{ cursor: 'pointer', padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border-dark)', background: 'var(--bg-card)', color: 'var(--text-light)', fontWeight: 500 }}
          >
            {testing ? '🔌 Testing...' : '🔌 Test Connection'}
          </button>
          <span className="form-help" style={{ margin: 0 }}>Verify if the API key secret is correctly set on your server.</span>
        </div>


        {/* Status */}
        <div className="status-card-box connected" style={{ marginTop: '16px' }}>
          <span>🟢</span>
          <span>
            Active Provider: {PROVIDER_LABELS[provider]} {model ? `(${model})` : ''}
          </span>
        </div>

        {/* Save */}
        <button
          id="btn-save-settings"
          className="form-submit-btn"
          onClick={handleSave}
          disabled={saving}
          style={{ marginTop: '16px' }}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>


        {saveMessage && (
          <div style={{ 
            fontSize: '0.85rem', 
            textAlign: 'center',
            color: saveMessage.startsWith('✅') ? 'var(--cat-meal)' : 'var(--cat-expense)',
            marginTop: '8px'
          }}>
            {saveMessage}
          </div>
        )}

        {/* Custom Presets Section */}
        <h4 className="settings-section-title" style={{ marginTop: '28px', marginBottom: '8px', color: 'var(--text-light)', borderBottom: '1px solid var(--border-dark)', paddingBottom: '4px', fontSize: '0.95rem', fontWeight: 600 }}>📋 Custom Quick-Log Presets</h4>
        <span className="form-help" style={{ marginBottom: '16px', display: 'block', opacity: 0.8 }}>
          Configure custom buttons for each category. Enter values as comma-separated text (e.g. <code>Oats, Salad, Rice</code>). Leave blank to auto-calculate from your history.
        </span>

        <div className="form-row">
          <label className="form-label">Meals Presets</label>
          <input
            className="form-input"
            type="text"
            value={presetMeal}
            onChange={e => setPresetMeal(e.target.value)}
            placeholder="e.g. Oats & Coffee, Salad, Chicken Rice"
          />
        </div>

        <div className="form-row">
          <label className="form-label">Expenses Presets</label>
          <input
            className="form-input"
            type="text"
            value={presetExpense}
            onChange={e => setPresetExpense(e.target.value)}
            placeholder="e.g. Coffee, Groceries, Zomato"
          />
        </div>

        <div className="form-row">
          <label className="form-label">Sleep Presets</label>
          <input
            className="form-input"
            type="text"
            value={presetSleep}
            onChange={e => setPresetSleep(e.target.value)}
            placeholder="e.g. 8h Restful Sleep, 7h Sleep"
          />
        </div>

        <div className="form-row">
          <label className="form-label">Exercise Presets</label>
          <input
            className="form-input"
            type="text"
            value={presetExercise}
            onChange={e => setPresetExercise(e.target.value)}
            placeholder="e.g. 5K Run, Gym Workout, Walk"
          />
        </div>

        <div className="form-row">
          <label className="form-label">Mood Presets</label>
          <input
            className="form-input"
            type="text"
            value={presetMood}
            onChange={e => setPresetMood(e.target.value)}
            placeholder="e.g. Happy, Tired, Energetic"
          />
        </div>

        <div className="form-row">
          <label className="form-label">Water Presets</label>
          <input
            className="form-input"
            type="text"
            value={presetWater}
            onChange={e => setPresetWater(e.target.value)}
            placeholder="e.g. 500ml Water, 1L Bottle, Glass"
          />
        </div>

        <div className="form-row">
          <label className="form-label">Reminders Presets</label>
          <input
            className="form-input"
            type="text"
            value={presetReminder}
            onChange={e => setPresetReminder(e.target.value)}
            placeholder="e.g. Drink water, Call mom, Buy groceries"
          />
        </div>

        <div className="form-row">
          <label className="form-label">Work Presets</label>
          <input
            className="form-input"
            type="text"
            value={presetWork}
            onChange={e => setPresetWork(e.target.value)}
            placeholder="e.g. Laptop Work, Software Dev, Meeting"
          />
        </div>

        <div className="form-row">
          <label className="form-label">Books Presets</label>
          <input
            className="form-input"
            type="text"
            value={presetBook}
            onChange={e => setPresetBook(e.target.value)}
            placeholder="e.g. Finished Chapter, Started New Book, Audiobook Session"
          />
        </div>

        <div className="form-row" style={{ marginBottom: '24px' }}>
          <label className="form-label">Notes Presets</label>
          <input
            className="form-input"
            type="text"
            value={presetNote}
            onChange={e => setPresetNote(e.target.value)}
            placeholder="e.g. Study, Reading, Water Plants"
          />
        </div>

        {/* Env var info */}
        <div className="form-row" style={{ marginTop: '20px' }}>
          <span className="form-help" style={{ opacity: 0.6 }}>
            You can also configure via .env file. Settings saved here override .env values.
          </span>
        </div>

        {/* Data Export & Backup */}
        <h4 className="settings-section-title" style={{ marginTop: '28px', marginBottom: '8px', color: 'var(--text-light)', borderBottom: '1px solid var(--border-dark)', paddingBottom: '4px', fontSize: '0.95rem', fontWeight: 600 }}>📊 Data Export & Backup</h4>
        <span className="form-help" style={{ marginBottom: '16px', display: 'block', opacity: 0.8 }}>
          Download a complete backup of all your logs. If you switch servers or want to keep a local copy, you can export your data anytime.
        </span>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
          <button
            type="button"
            className="form-select"
            onClick={() => handleExport('csv')}
            disabled={exporting}
            style={{ cursor: 'pointer', padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border-dark)', background: 'var(--bg-card)', color: 'var(--text-light)', fontWeight: 500 }}
          >
            📄 Export to CSV
          </button>
          <button
            type="button"
            className="form-select"
            onClick={() => handleExport('json')}
            disabled={exporting}
            style={{ cursor: 'pointer', padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border-dark)', background: 'var(--bg-card)', color: 'var(--text-light)', fontWeight: 500 }}
          >
            {exporting ? '⏳ Exporting...' : '⚙️ Export to JSON'}
          </button>
        </div>
      </div>
    </div>
  );
}
