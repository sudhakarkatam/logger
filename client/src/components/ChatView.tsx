import { useState, useRef, useEffect } from 'react';
import { sendMessage, getSettings, uploadMedia } from '../api';
import type { ChatMessage } from '../types';
import MessageBubble from './MessageBubble';

const SUGGESTIONS = [
  { text: 'morning eaten oats and coffee', label: '🥣 Oats & Coffee' },
  { text: 'feeling happy and energetic today', label: '💪 Happy & Energetic' },
  { text: 'ran 5k in 25 mins, moderate run', label: '🏃 5K Run' },
  { text: 'spent 120 on lunch salad', label: '🥗 Spent 120 on Salad' },
  { text: 'slept 8 hours, felt well rested', label: '😴 8h Restful Sleep' },
  { text: 'confused what to eat today', label: '💡 What should I eat?' },
];

export default function ChatView() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [draftContext, setDraftContext] = useState<any | null>(null);
  const [activeModel, setActiveModel] = useState<string>('LLM Engine');
  const [isListening, setIsListening] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
    loadActiveModel();
  }, []);

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

      const response = await sendMessage(finalMsgText || '📷 Sent a photo', 1, draftContext, historyPayload, imageUrl);

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
              <textarea
                ref={inputRef}
                id="chat-input"
                className="chat-text-input"
                placeholder="Type what you did or upload a photo..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                autoComplete="off"
                rows={1}
              />
              <div className="capsule-controls">
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button type="button" className="capsule-plus-btn" title="Add photo" onClick={() => fileInputRef.current?.click()}>📷</button>
                  <button
                    type="button"
                    className={`capsule-mic-btn ${isListening ? 'listening' : ''}`}
                    onClick={toggleListening}
                    title={isListening ? "Stop listening" : "Start voice input"}
                  >
                    {isListening ? '🛑' : '🎙️'}
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
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  className="suggestion-card"
                  onClick={() => handleSend(s.text)}
                >
                  {s.label}
                </button>
              ))}
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
            <textarea
              ref={inputRef}
              id="chat-input"
              className="chat-text-input"
              placeholder={
                draftContext 
                  ? "Provide clarification requested above..." 
                  : "Ate oats for breakfast, spent 150 on groceries..."
              }
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              autoComplete="off"
              rows={1}
            />
            <div className="capsule-controls">
              <div style={{ display: 'flex', gap: '4px' }}>
                <button type="button" className="capsule-plus-btn" title="Add photo" onClick={() => fileInputRef.current?.click()}>📷</button>
                <button
                  type="button"
                  className={`capsule-mic-btn ${isListening ? 'listening' : ''}`}
                  onClick={toggleListening}
                  title={isListening ? "Stop listening" : "Start voice input"}
                >
                  {isListening ? '🛑' : '🎙️'}
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
