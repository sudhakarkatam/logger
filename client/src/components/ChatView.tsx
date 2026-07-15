import { useState, useRef, useEffect } from 'react';
import { sendMessage, getSettings, uploadMedia, queryEntries } from '../api';
import type { ChatMessage } from '../types';
import MessageBubble from './MessageBubble';

const CATEGORY_CHIPS = [
  { category: 'meal', prefix: 'log meal: ', label: '🍲 Meals' },
  { category: 'expense', prefix: 'log expense: ', label: '💳 Spendings' },
  { category: 'sleep', prefix: 'log sleep: ', label: '😴 Sleep' },
  { category: 'exercise', prefix: 'log exercise: ', label: '🏃 Exercise' },
  { category: 'mood', prefix: 'log mood: ', label: '🧠 Mood' },
  { category: 'water', prefix: 'log water: ', label: '💧 Water' },
  { category: 'reminder', prefix: 'log reminder: ', label: '⏰ Reminders' },
  { category: 'idea', prefix: 'log idea: ', label: '💡 Ideas' },
  { category: 'book', prefix: 'log book: ', label: '📚 Books' },
  { category: 'other', prefix: 'log note: ', label: '💡 Notes' },
];

const DEFAULT_PRESETS: Record<string, string[]> = {
  meal: ['Oats & Coffee ☕', 'Lunch Salad 🥗', 'Dinner Rice 🍛'],
  expense: ['Coffee ☕', 'Groceries 🛒', 'Uber 🚗'],
  sleep: ['7h Sleep 🛌', '8h Restful Sleep 😴', '6h Tired Sleep 🥱'],
  exercise: ['5K Run 🏃', 'Gym Workout 🏋️', 'Walk 🚶'],
  mood: ['Happy 😊', 'Energetic 💪', 'Tired 🥱'],
  water: ['500ml Water 💧', '1L Bottle 🥛', 'Glass of Water 🥤'],
  reminder: ['Drink Water 💧', 'Take Meds 💊', 'Call Mom 📞'],
  idea: ['Startup Idea 💡', 'Coding Project 💻', 'Design Concept 🎨'],
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
  
  const [chefMode, setChefMode] = useState(false);

  // Custom Presets & Shortcuts States
  const [dbEntries, setDbEntries] = useState<any[]>([]);
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const [activeSlashIndex, setActiveSlashIndex] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          } else if (category === 'idea') {
            val = e.data?.idea_text || e.raw_text || '';
            val = val.replace(/^log idea:\s*/i, '');
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
    if (text.startsWith('log idea:')) return 'idea';
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
      const labels: Record<string, string> = {
        gemini: 'Gemini Flash',
        groq: 'Llama 3.3 (Groq)',
        openrouter: 'OpenRouter Free',
        openai: 'GPT-4o Mini',
        anthropic: 'Claude Haiku',
      };
      setActiveModel(labels[data.provider] || data.model || 'LLM Engine');
    } catch (err) {
      console.error(err);
    }
  };

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

    const historyPayload = messages.map(m => ({
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

    const historyPayload = messages.map(m => ({
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

      const response = await sendMessage(finalMsgText || '📷 Sent a photo', 1, draftContext, historyPayload, imageUrl, chefMode ? 'pantry' : 'general');

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
    if (hour < 12) return 'Morning, Sudhakar';
    if (hour < 17) return 'Afternoon, Sudhakar';
    return 'Evening, Sudhakar';
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
                  chefMode
                    ? "Ask Chef: what to cook, list ingredients, or save a recipe..."
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
                  <button
                    type="button"
                    onClick={() => setChefMode(prev => !prev)}
                    title={chefMode ? "Deactivate Chef Mode" : "Activate Chef & Pantry Mode"}
                    style={{
                      background: chefMode ? 'rgba(255, 145, 77, 0.15)' : 'transparent',
                      border: chefMode ? '1px solid var(--brand-orange)' : 'none',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: chefMode ? 'var(--brand-orange)' : 'var(--text-muted)',
                      transition: 'all var(--transition-fast)'
                    }}
                  >
                    🍲 {chefMode ? 'Chef Mode' : 'Chef'}
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-dark)', fontWeight: 500 }}>
                    {activeModel}
                  </span>
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
                chefMode
                  ? "Ask Chef: what to cook, list ingredients, or save a recipe..."
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
                <button
                  type="button"
                  onClick={() => setChefMode(prev => !prev)}
                  title={chefMode ? "Deactivate Chef Mode" : "Activate Chef & Pantry Mode"}
                  style={{
                    background: chefMode ? 'rgba(255, 145, 77, 0.15)' : 'transparent',
                    border: chefMode ? '1px solid var(--brand-orange)' : 'none',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: chefMode ? 'var(--brand-orange)' : 'var(--text-muted)',
                    transition: 'all var(--transition-fast)'
                  }}
                >
                  🍲 {chefMode ? 'Chef Mode' : 'Chef'}
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-dark)', fontWeight: 500 }}>
                  {activeModel}
                </span>
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
    </div>
  );
}
