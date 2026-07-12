import { useState, useEffect } from 'react';
import { getSettings, updateSettings } from '../api';
import type { Provider, LLMSettings } from '../types';

const PROVIDER_LABELS: Record<Provider, string> = {
  gemini: 'Google Gemini',
  groq: 'Groq',
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  anthropic: 'Anthropic Claude',
};

const PROVIDER_HINTS: Record<Provider, string> = {
  gemini: 'Free tier available. Get your key at ai.google.dev',
  groq: 'Free tier available. Get your key at console.groq.com',
  openrouter: 'Many free models available. Get your key at openrouter.ai',
  openai: 'Paid. Get your key at platform.openai.com',
  anthropic: 'Paid. Get your key at console.anthropic.com',
};

export default function SettingsPanel() {
  const [settings, setSettings] = useState<LLMSettings | null>(null);
  const [provider, setProvider] = useState<Provider>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await getSettings();
      setSettings(data);
      setProvider(data.provider);
      setModel(data.model);
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  const handleProviderChange = (newProvider: Provider) => {
    setProvider(newProvider);
    const info = settings?.availableProviders.find(p => p.id === newProvider);
    if (info) {
      setModel(info.defaultModel);
    }
    setApiKey('');
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage('');
    try {
      await updateSettings(
        provider,
        apiKey || undefined,
        model || undefined
      );
      setSaveMessage('✅ Settings saved!');
      await loadSettings();
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err) {
      setSaveMessage(`❌ ${err instanceof Error ? err.message : 'Save failed'}`);
    } finally {
      setSaving(false);
    }
  };

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

        {/* API Key */}
        <div className="form-row">
          <label className="form-label">API Key</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              id="settings-api-key"
              className="form-input"
              type={showKey ? 'text' : 'password'}
              placeholder="Paste your API key..."
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              className="form-select"
              onClick={() => setShowKey(!showKey)}
              title={showKey ? 'Hide' : 'Show'}
              style={{ flexShrink: 0, cursor: 'pointer', padding: '0 12px' }}
            >
              {showKey ? '🙈' : '👁️'}
            </button>
          </div>
          <span className="form-help">
            Leave blank to keep existing key. 
            {settings?.hasApiKey ? ' A key is currently configured.' : ' No key set yet.'}
          </span>
        </div>

        {/* Model */}
        <div className="form-row">
          <label className="form-label">Model</label>
          <input
            id="settings-model"
            className="form-input"
            type="text"
            value={model}
            onChange={e => setModel(e.target.value)}
            placeholder="Model name"
          />
          <span className="form-help">Default model for the selected provider. You can customize this.</span>
        </div>

        {/* Status */}
        <div className={`status-card-box ${settings?.hasApiKey ? 'connected' : 'disconnected'}`}>
          <span>{settings?.hasApiKey ? '🟢' : '🔴'}</span>
          <span>
            {settings?.hasApiKey
              ? `Connected — using ${PROVIDER_LABELS[settings.provider]}`
              : 'Not connected — configure an API key to start'}
          </span>
        </div>

        {/* Save */}
        <button
          id="btn-save-settings"
          className="form-submit-btn"
          onClick={handleSave}
          disabled={saving}
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

        {/* Env var info */}
        <div className="form-row" style={{ marginTop: '20px' }}>
          <span className="form-help" style={{ opacity: 0.6 }}>
            You can also configure via .env file. Settings saved here override .env values.
          </span>
        </div>
      </div>
    </div>
  );
}
