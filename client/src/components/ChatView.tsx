import { useState, useRef, useEffect } from 'react';
import { sendMessage, getSettings, updateSettings, uploadMedia, queryEntries, deleteEntry } from '../api';
import type { ChatMessage } from '../types';
import MessageBubble from './MessageBubble';

const QUICK_MODELS: Record<string, { id: string; label: string; free: boolean }[]> = {
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

const PROVIDER_DISPLAY: Record<string, string> = {
  groq: 'Groq',
  gemini: 'Gemini',
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};

const CATEGORY_CHIPS = [
  { category: 'meal', prefix: 'log meal: ', label: '🍲 Meals' },
  { category: 'expense', prefix: 'log expense: ', label: '💳 Spendings' },
  { category: 'sleep', prefix: 'log sleep: ', label: '😴 Sleep' },
  { category: 'exercise', prefix: 'log exercise: ', label: '🏃 Exercise' },
  { category: 'mood', prefix: 'log mood: ', label: '🧠 Mood' },
  { category: 'water', prefix: 'log water: ', label: '💧 Water' },
  { category: 'reminder', prefix: 'log reminder: ', label: '⏰ Reminders' },
  { category: 'work', prefix: 'log work: ', label: '💻 Work' },
  { category: 'book', prefix: 'log book: ', label: '📚 Books' },
  { category: 'other', prefix: 'log note: ', label: '💡 Notes' },
];

const DEFAULT_PRESETS: Record<string, string[]> = {
  meal: ['Idli Dosa ☕', 'Rice & Dal 🍛', 'Biryani 🍗'],
  expense: ['Tea & Snacks ☕', 'Groceries 🛒', 'Auto/Uber 🚗'],
  sleep: ['7h Sleep 🛌', '8h Restful Sleep 😴', '6h Tired Sleep 🥱'],
  exercise: ['5K Run 🏃', 'Gym Workout 🏋️', 'Walk 🚶'],
  mood: ['Happy 😊', 'Energetic 💪', 'Tired 🥱'],
  water: ['500ml Water 💧', '1L Bottle 🥛', 'Glass of Water 🥤'],
  reminder: ['Drink Water 💧', 'Take Meds 💊', 'Call Mom 📞'],
  work: ['Laptop Work 💻', 'Software Dev ⚙️', 'Meeting 📅'],
  book: ['Finished Chapter 📖', 'Started New Book 📚', 'Audiobook Session 🎧'],
  other: ['Study 📚', 'Water Plants 🪴', 'Read Book 📖']
};

export default function ChatView() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [draftContext, setDraftContext] = useState<any | null>(null);
  const [activeModel, setActiveModel] = useState<string>('LLM Engine');
  const [isListening, setIsListening] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  
  const [chatMode, setChatMode] = useState<'normal' | 'chef' | 'lifegpt'>('normal');
  const [lastLoggedEntry, setLastLoggedEntry] = useState<any | null>(null);
  const [showUndoToast, setShowUndoToast] = useState(false);

  // Model Picker State
  const [showModelPicker, setShowModelPicker] = useState(false);

  // Custom Presets & Shortcuts States
  const [dbEntries, setDbEntries] = useState<any[]>([]);
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const [activeSlashIndex, setActiveSlashIndex] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);

  // Helper to place cursor at the far right/end of input
  const focusInputAtEnd = (customValue?: string) => {
    setTimeout(() => {
      if (inputRef.current) {
        const val = customValue !== undefined ? customValue : inputRef.current.value;
        const length = val.length;
        inputRef.current.focus();
        inputRef.current.setSelectionRange(length, length);
      }
    }, 50);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
    loadActiveModel();
    loadDbEntries();
  }, []);

  const loadDbEntries = async () => {
    try {
      const res = await queryEntries(undefined, 100);
      if (res.data) {
        setDbEntries(res.data);
      }
    } catch (err) {
      console.error('Failed to load entries for presets:', err);
    }
  };

  const getPresets = (category: string): string[] => {
    // 1. Check custom overrides from localStorage
    const rawPresets = localStorage.getItem('life_logger_custom_presets');
    if (rawPresets) {
      const parsed = JSON.parse(rawPresets);
      const customString = parsed[category] || '';
      if (customString.trim()) {
        return customString.split(',').map((s: string) => s.trim()).filter(Boolean).slice(0, 3);
      }
    }

    // 2. Fall back to local DB entries frequency calculation
    if (dbEntries.length > 0) {
      const counts: Record<string, number> = {};
      dbEntries
        .filter((e: any) => e.category === category)
        .forEach((e: any) => {
          let val = '';
          if (category === 'meal') {
            val = e.data?.items?.[0] || e.raw_text || '';
            val = val.replace(/^log meal:\s*/i, '');
          } else if (category === 'expense') {
            val = e.data?.description || e.raw_text || '';
            val = val.replace(/^log expense:\s*/i, '');
          } else if (category === 'exercise') {
            val = e.data?.activity || e.raw_text || '';
            val = val.replace(/^log exercise:\s*/i, '');
          } else if (category === 'sleep') {
            if (e.data?.hours) val = `${e.data.hours}h sleep`;
          } else if (category === 'mood') {
            val = e.data?.mood || '';
          } else if (category === 'water') {
            val = e.data?.amount || e.raw_text || '';
            val = val.toString().replace(/^log water:\s*/i, '');
            if (val && !val.toLowerCase().includes('water')) val = `${val} water`;
          } else if (category === 'reminder') {
            val = e.data?.reminder_text || e.raw_text || '';
            val = val.replace(/^log reminder:\s*/i, '');
          } else if (category === 'work') {
            val = e.data?.work_text || e.data?.description || e.raw_text || '';
            val = val.replace(/^log work:\s*/i, '');
          } else if (category === 'book') {
            val = e.data?.book || e.data?.title || e.raw_text || '';
            val = val.toString().replace(/^log book:\s*/i, '');
          } else {
            val = e.raw_text || '';
            val = val.replace(/^log note:\s*/i, '').replace(/^log other:\s*/i, '');
          }
          val = val.trim();
          if (val && val.length < 35) {
            counts[val] = (counts[val] || 0) + 1;
          }
        });

      const sorted = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(entry => entry[0])
        .filter(Boolean);

      if (sorted.length > 0) {
        const result = [...sorted];
        const defaults = DEFAULT_PRESETS[category] || [];
        for (const def of defaults) {
          if (result.length >= 3) break;
          if (!result.includes(def)) {
            result.push(def);
          }
        }
        return result.slice(0, 3);
      }
    }

    // 3. Fall back to defaults
    return DEFAULT_PRESETS[category] || [];
  };

  const getActiveCategory = (): string | null => {
    const text = input.trim().toLowerCase();
    if (text.startsWith('log meal:')) return 'meal';
    if (text.startsWith('log expense:')) return 'expense';
    if (text.startsWith('log sleep:')) return 'sleep';
    if (text.startsWith('log exercise:')) return 'exercise';
    if (text.startsWith('log mood:')) return 'mood';
    if (text.startsWith('log water:')) return 'water';
    if (text.startsWith('log reminder:')) return 'reminder';
    if (text.startsWith('log work:')) return 'work';
    if (text.startsWith('log book:')) return 'book';
    if (text.startsWith('log note:')) return 'other';
    return null;
  };

  const handleInputChange = (val: string) => {
    setInput(val);
    if (val.startsWith('/')) {
      setShowSlashCommands(true);
      setActiveSlashIndex(0);
    } else {
      setShowSlashCommands(false);
    }
  };

  const loadActiveModel = async () => {
    try {
      const data = await getSettings();
      // Build display label from actual model name
      const shortModel = data.model?.split('/').pop()?.split(':')[0] || '';
      const providerLabel = PROVIDER_DISPLAY[data.provider] || data.provider;
      setActiveModel(shortModel ? `${shortModel} (${providerLabel})` : providerLabel);
    } catch (err) {
      console.error(err);
    }
  };

  const handleQuickModelSwitch = async (providerId: string, modelId: string) => {
    await updateSettings(providerId, modelId);
    const shortModel = modelId.split('/').pop()?.split(':')[0] || modelId;
    const providerLabel = PROVIDER_DISPLAY[providerId] || providerId;
    setActiveModel(`${shortModel} (${providerLabel})`);
    setShowModelPicker(false);
  };

  // Click outside to close model picker
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const isImage = file.type.startsWith('image/');
      const isText = file.type.startsWith('text/') || 
                     file.name.endsWith('.csv') || 
                     file.name.endsWith('.md') || 
                     file.name.endsWith('.json');

      if (!isImage && !isText) {
        alert('Please select an image or a text/data file (CSV, TXT, MD, JSON).');
        return;
      }
      setSelectedFile(file);
      if (isImage) {
        setFilePreview(URL.createObjectURL(file));
      } else {
        setFilePreview('text-file');
      }
    }
  };

  const removeSelectedFile = () => {
    setSelectedFile(null);
    if (filePreview) {
      URL.revokeObjectURL(filePreview);
      setFilePreview(null);
    }
  };

  const handleCardAction = async (textValue: string, actionDraftContext: any) => {
    if (isLoading) return;

    // Add user confirmation as a message bubble
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      text: textValue,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    const historyPayload = messages.slice(-10).map(m => ({
      role: m.type === 'user' ? 'user' : 'assistant',
      content: m.text
    }));

    try {
      const response = await sendMessage(textValue, 1, actionDraftContext || draftContext, historyPayload);

      if (response.needs_clarification) {
        setDraftContext(response.draftContext);
      } else {
        setDraftContext(null);
      }

      const systemMsg: ChatMessage = {
        id: `system-${Date.now()}`,
        type: 'system',
        text: response.acknowledgment,
        timestamp: new Date().toISOString(),
        category: response.entry ? response.entry.category : undefined,
        entry: response.entry || undefined,
        interactiveCard: response.interactiveCard || null
      };
      setMessages(prev => [...prev, systemMsg]);
      loadDbEntries(); // dynamically update local presets cache
    } catch (error) {
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        type: 'system',
        text: `⚠️ ${error instanceof Error ? error.message : 'Action failed.'}`,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleSend = async (text?: string) => {
    const messageText = (text || input).trim();
    if (!messageText && !selectedFile || isLoading) return;

    // Add user message with local image preview URL or document note for instant screen update
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      text: messageText || (selectedFile?.type.startsWith('image/') ? '📷 Sent a photo' : `📄 Uploaded ${selectedFile?.name}`),
      timestamp: new Date().toISOString(),
      imageUrl: (selectedFile?.type.startsWith('image/') && filePreview) ? filePreview : undefined
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    const historyPayload = messages.slice(-10).map(m => ({
      role: m.type === 'user' ? 'user' : 'assistant',
      content: m.text
    }));

    try {
      let finalMsgText = messageText;
      let imageUrl: string | undefined = undefined;

      if (selectedFile) {
        if (selectedFile.type.startsWith('image/')) {
          imageUrl = await uploadMedia(selectedFile);
        } else {
          // Read text file browser-side using FileReader
          const fileContent = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsText(selectedFile);
          });
          finalMsgText += `\n\n[Uploaded Document: ${selectedFile.name}]\n${fileContent}`;
        }
        removeSelectedFile();
      }

      const response = await sendMessage(
        finalMsgText || '📷 Sent a photo', 
        1, 
        draftContext, 
        historyPayload, 
        imageUrl, 
        chatMode === 'chef' ? 'pantry' : chatMode === 'lifegpt' ? 'lifegpt' : 'general'
      );

      if (response.needs_clarification) {
        setDraftContext(response.draftContext);
      } else {
        setDraftContext(null);
      }

      // Add system reply
      const systemMsg: ChatMessage = {
        id: `system-${Date.now()}`,
        type: 'system',
        text: response.acknowledgment,
        timestamp: new Date().toISOString(),
        category: response.entry ? response.entry.category : undefined,
        entry: response.entry || undefined,
        interactiveCard: response.interactiveCard || null
      };
      setMessages(prev => [...prev, systemMsg]);
      
      if (response.entry) {
        setLastLoggedEntry(response.entry);
        setShowUndoToast(true);
        // Auto hide toast after 6 seconds
        setTimeout(() => {
          setShowUndoToast(false);
        }, 6000);
      } else {
        setShowUndoToast(false);
      }
      
      loadDbEntries(); // dynamically update local presets cache
    } catch (error) {
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        type: 'system',
        text: `⚠️ ${error instanceof Error ? error.message : 'Connection failed. Please verify LLM setup.'}`,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleUndo = async () => {
    if (!lastLoggedEntry) return;
    try {
      await deleteEntry(lastLoggedEntry.id);
      // Remove last 2 messages (user message + system acknowledgment)
      setMessages(prev => prev.slice(0, -2));
      setLastLoggedEntry(null);
      setShowUndoToast(false);
      loadDbEntries();
    } catch (err) {
      console.error(err);
      alert('Failed to undo last log.');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSlashCommands) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveSlashIndex(prev => (prev + 1) % CATEGORY_CHIPS.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveSlashIndex(prev => (prev - 1 + CATEGORY_CHIPS.length) % CATEGORY_CHIPS.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const selectedChip = CATEGORY_CHIPS[activeSlashIndex];
        setInput(selectedChip.prefix);
        setShowSlashCommands(false);
        focusInputAtEnd(selectedChip.prefix);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSlashCommands(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. Try Chrome, Edge, or Safari!');
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => prev ? `${prev} ${transcript}` : transcript);
    };

    recognition.start();
  };

  // Get greeting text based on local time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Morning, Buddy';
    if (hour < 17) return 'Afternoon, Buddy';
    return 'Evening, Buddy';
  };

  return (
    <div className="chat-window">
      {/* Hidden File Input */}
      <input 
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*,text/plain,text/csv,text/markdown,application/json"
        style={{ display: 'none' }}
      />

      {/* Messages Scroll Area */}
      <div className="chat-scroller">
        {messages.length === 0 ? (
          <div className="chat-hero">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#d97706', marginBottom: '20px', opacity: 0.9 }}>
              <line x1="12" y1="2" x2="12" y2="22" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
              <line x1="4.93" y1="19.07" x2="19.07" y2="4.93" />
            </svg>
            <h2 className="chat-hero-title">
              {getGreeting()}
            </h2>

            {/* Input Capsule Centered in Hero Screen */}
            <div className="input-container" style={{ width: '100%', maxWidth: '600px' }}>
              {filePreview && (
                <div className="image-preview-bar">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {selectedFile?.type.startsWith('image/') ? (
                      <img src={filePreview} alt="Preview" className="image-preview-thumbnail" />
                    ) : (
                      <div className="file-preview-icon" style={{ fontSize: '1.2rem', marginRight: '4px' }}>📄</div>
                    )}
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                      {selectedFile?.name}
                    </span>
                  </div>
                  <button className="image-preview-remove-btn" onClick={removeSelectedFile} title="Remove file">✕</button>
                </div>
              )}
              {showSlashCommands && (
                <div className="slash-commands-dropdown">
                  {CATEGORY_CHIPS.map((chip, idx) => (
                    <button
                      key={idx}
                      className={`slash-command-item ${idx === activeSlashIndex ? 'active' : ''}`}
                      type="button"
                      onClick={() => {
                        setInput(chip.prefix);
                        setShowSlashCommands(false);
                        focusInputAtEnd(chip.prefix);
                      }}
                    >
                      <span className="slash-command-label">/{chip.category === 'other' ? 'note' : chip.category}</span>
                      <span className="slash-command-desc">Insert "{chip.prefix}" template</span>
                    </button>
                  ))}
                </div>
              )}
              <textarea
                ref={inputRef}
                id="chat-input"
                className="chat-text-input"
                placeholder={
                  chatMode === 'chef'
                    ? "Ask Chef: what to cook, list ingredients, or save a recipe..."
                    : chatMode === 'lifegpt'
                      ? "Ask Life GPT Coach: How has my productivity changed? Why am I feeling tired?..."
                      : "Type what you did or upload a photo..."
                }
                value={input}
                onChange={e => handleInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                autoComplete="off"
                rows={1}
              />
              <div className="capsule-controls">
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <button type="button" className="capsule-plus-btn" title="Add photo" onClick={() => fileInputRef.current?.click()}>📷</button>
                  <button
                    type="button"
                    className={`capsule-mic-btn ${isListening ? 'listening' : ''}`}
                    onClick={toggleListening}
                    title={isListening ? "Stop listening" : "Start voice input"}
                  >
                    {isListening ? '🛑' : '🎙️'}
                  </button>
                  
                  {/* Chef Mode Toggle */}
                  <button
                    type="button"
                    onClick={() => setChatMode(prev => prev === 'chef' ? 'normal' : 'chef')}
                    title={chatMode === 'chef' ? "Deactivate Chef Mode" : "Activate Chef & Pantry Mode"}
                    style={{
                      background: chatMode === 'chef' ? 'rgba(255, 145, 77, 0.15)' : 'transparent',
                      border: chatMode === 'chef' ? '1px solid #ff914d' : 'none',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: chatMode === 'chef' ? '#ff914d' : 'var(--text-muted)',
                      transition: 'all var(--transition-fast)'
                    }}
                  >
                    🍲 Chef
                  </button>

                  {/* Life GPT Mode Toggle */}
                  <button
                    type="button"
                    onClick={() => setChatMode(prev => prev === 'lifegpt' ? 'normal' : 'lifegpt')}
                    title={chatMode === 'lifegpt' ? "Deactivate Life GPT Mode" : "Activate Life GPT AI Coach"}
                    style={{
                      background: chatMode === 'lifegpt' ? 'rgba(192, 132, 252, 0.15)' : 'transparent',
                      border: chatMode === 'lifegpt' ? '1px solid #c084fc' : 'none',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: chatMode === 'lifegpt' ? '#c084fc' : 'var(--text-muted)',
                      transition: 'all var(--transition-fast)'
                    }}
                  >
                    🧠 Coach
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div ref={modelPickerRef} style={{ position: 'relative' }}>
                    <button
                      type="button"
                      className="model-picker-btn"
                      onClick={() => setShowModelPicker(!showModelPicker)}
                      title="Change Model & Provider"
                    >
                      {activeModel} ▾
                    </button>
                    {showModelPicker && (
                      <div className="model-picker-dropdown">
                        {Object.entries(QUICK_MODELS).map(([providerId, models]) => (
                          <div key={providerId} className="model-picker-group">
                            <div className="model-picker-group-label">{PROVIDER_DISPLAY[providerId] || providerId}</div>
                            {models.map(m => (
                              <button
                                key={m.id}
                                type="button"
                                className="model-picker-item"
                                onClick={() => handleQuickModelSwitch(providerId, m.id)}
                              >
                                <span>{m.label}</span>
                                {m.free && <span className="model-picker-free-badge">FREE</span>}
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    id="btn-send"
                    className="send-dock-btn"
                    onClick={() => handleSend()}
                    disabled={(!input.trim() && !selectedFile) || isLoading}
                    title="Send"
                  >
                    ↑
                  </button>
                </div>
              </div>
            </div>

            {/* Suggestion pills aligned beneath the capsule */}
            <div className="hero-suggestions">
              {getActiveCategory() ? (
                getPresets(getActiveCategory()!).map((presetText, i) => (
                  <button
                    key={i}
                    type="button"
                    className="suggestion-card preset-card animate-slide-in"
                    onClick={() => {
                      const activeCat = getActiveCategory()!;
                      const prefixObj = CATEGORY_CHIPS.find(c => c.category === activeCat);
                      const prefix = prefixObj ? prefixObj.prefix : '';
                      const nextVal = prefix + presetText + ' ';
                      setInput(nextVal);
                      focusInputAtEnd(nextVal);
                    }}
                  >
                    {presetText}
                  </button>
                ))
              ) : (
                CATEGORY_CHIPS.map((chip, i) => (
                  <button
                    key={i}
                    type="button"
                    className="suggestion-card category-card"
                    onClick={() => {
                      setInput(chip.prefix);
                      focusInputAtEnd(chip.prefix);
                    }}
                  >
                    {chip.label}
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          messages.map((msg, index) => (
            <MessageBubble 
              key={msg.id} 
              message={msg} 
              onCardActionClick={handleCardAction}
              isActiveCard={draftContext !== null && index === messages.length - 1}
            />
          ))
        )}

        {/* Typing indicator */}
        {isLoading && (
          <div className="msg-wrapper system">
            <div className="typing-bubble">
              <div className="typing-dot" style={{ animationDelay: '0s' }} />
              <div className="typing-dot" style={{ animationDelay: '0.2s' }} />
              <div className="typing-dot" style={{ animationDelay: '0.4s' }} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Dock (Only visible when conversation has started) */}
      {messages.length > 0 && (
        <div className="input-dock">
          <div className="input-container">
            {filePreview && (
              <div className="image-preview-bar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {selectedFile?.type.startsWith('image/') ? (
                    <img src={filePreview} alt="Preview" className="image-preview-thumbnail" />
                  ) : (
                    <div className="file-preview-icon" style={{ fontSize: '1.2rem', marginRight: '4px' }}>📄</div>
                  )}
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                    {selectedFile?.name}
                  </span>
                </div>
                <button className="image-preview-remove-btn" onClick={removeSelectedFile} title="Remove file">✕</button>
              </div>
            )}
            {showSlashCommands && (
              <div className="slash-commands-dropdown">
                {CATEGORY_CHIPS.map((chip, idx) => (
                  <button
                    key={idx}
                    className={`slash-command-item ${idx === activeSlashIndex ? 'active' : ''}`}
                    type="button"
                    onClick={() => {
                      setInput(chip.prefix);
                      setShowSlashCommands(false);
                      focusInputAtEnd(chip.prefix);
                    }}
                  >
                    <span className="slash-command-label">/{chip.category === 'other' ? 'note' : chip.category}</span>
                    <span className="slash-command-desc">Insert "{chip.prefix}" template</span>
                  </button>
                ))}
              </div>
            )}
            <textarea
              ref={inputRef}
              id="chat-input"
              className="chat-text-input"
              placeholder={
                chatMode === 'chef'
                  ? "Ask Chef: what to cook, list ingredients, or save a recipe..."
                  : chatMode === 'lifegpt'
                    ? "Ask Life GPT Coach: How has my productivity changed? Why am I feeling tired?..."
                    : draftContext 
                      ? "Provide clarification requested above..." 
                      : "Ate oats for breakfast, spent 150 on groceries..."
              }
              value={input}
              onChange={e => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              autoComplete="off"
              rows={1}
            />
            <div className="capsule-controls">
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <button type="button" className="capsule-plus-btn" title="Add photo" onClick={() => fileInputRef.current?.click()}>📷</button>
                <button
                  type="button"
                  className={`capsule-mic-btn ${isListening ? 'listening' : ''}`}
                  onClick={toggleListening}
                  title={isListening ? "Stop listening" : "Start voice input"}
                >
                  {isListening ? '🛑' : '🎙️'}
                </button>
                
                {/* Chef Mode Toggle */}
                <button
                  type="button"
                  onClick={() => setChatMode(prev => prev === 'chef' ? 'normal' : 'chef')}
                  title={chatMode === 'chef' ? "Deactivate Chef Mode" : "Activate Chef & Pantry Mode"}
                  style={{
                    background: chatMode === 'chef' ? 'rgba(255, 145, 77, 0.15)' : 'transparent',
                    border: chatMode === 'chef' ? '1px solid #ff914d' : 'none',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: chatMode === 'chef' ? '#ff914d' : 'var(--text-muted)',
                    transition: 'all var(--transition-fast)'
                  }}
                >
                  🍲 Chef
                </button>

                {/* Life GPT Mode Toggle */}
                <button
                  type="button"
                  onClick={() => setChatMode(prev => prev === 'lifegpt' ? 'normal' : 'lifegpt')}
                  title={chatMode === 'lifegpt' ? "Deactivate Life GPT Mode" : "Activate Life GPT AI Coach"}
                  style={{
                    background: chatMode === 'lifegpt' ? 'rgba(192, 132, 252, 0.15)' : 'transparent',
                    border: chatMode === 'lifegpt' ? '1px solid #c084fc' : 'none',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: chatMode === 'lifegpt' ? '#c084fc' : 'var(--text-muted)',
                    transition: 'all var(--transition-fast)'
                  }}
                >
                  🧠 Coach
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div ref={modelPickerRef} style={{ position: 'relative' }}>
                  <button
                    type="button"
                    className="model-picker-btn"
                    onClick={() => setShowModelPicker(!showModelPicker)}
                    title="Change Model & Provider"
                  >
                    {activeModel} ▾
                  </button>
                  {showModelPicker && (
                    <div className="model-picker-dropdown">
                      {Object.entries(QUICK_MODELS).map(([providerId, models]) => (
                        <div key={providerId} className="model-picker-group">
                          <div className="model-picker-group-label">{PROVIDER_DISPLAY[providerId] || providerId}</div>
                          {models.map(m => (
                            <button
                              key={m.id}
                              type="button"
                              className="model-picker-item"
                              onClick={() => handleQuickModelSwitch(providerId, m.id)}
                            >
                              <span>{m.label}</span>
                              {m.free && <span className="model-picker-free-badge">FREE</span>}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  id="btn-send"
                  className="send-dock-btn"
                  onClick={() => handleSend()}
                  disabled={(!input.trim() && !selectedFile) || isLoading}
                  title="Send"
                >
                  ↑
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showUndoToast && lastLoggedEntry && (
        <div style={{
          position: 'fixed',
          bottom: '80px',
          right: '20px',
          zIndex: 1000,
          background: 'var(--bg-capsule)',
          border: '1px solid var(--border-active)',
          borderRadius: '8px',
          padding: '12px 16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          animation: 'slideInUp 0.2s ease',
          minWidth: '280px'
        }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            📝 Logged: <strong style={{ textTransform: 'capitalize' }}>{lastLoggedEntry.category}</strong>
          </span>
          <button
            onClick={handleUndo}
            style={{
              marginLeft: 'auto',
              background: 'rgba(248, 113, 113, 0.12)',
              border: '1px solid rgba(248, 113, 113, 0.25)',
              color: 'var(--cat-expense)',
              padding: '5px 10px',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            ↩️ Undo
          </button>
          <button
            onClick={() => setShowUndoToast(false)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-dark)',
              cursor: 'pointer',
              fontSize: '0.9rem',
              padding: '0 4px'
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
