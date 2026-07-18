import { useState, useEffect } from 'react';
import ChatView from './components/ChatView';
import DashboardView from './components/DashboardView';
import SettingsPanel from './components/SettingsPanel';
import PantryCookbookView from './components/PantryCookbookView';
import VisionTestView from './components/VisionTestView';
import { getSettings } from './api';

type Tab = 'chat' | 'dashboard' | 'settings' | 'pantry' | 'vision';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [isReady, setIsReady] = useState(false);
  const [hasKey, setHasKey] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    checkStatus();
  }, [activeTab]);

  const checkStatus = async () => {
    try {
      await getSettings();
      setHasKey(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsReady(true);
    }
  };

  return (
    <div className="app-container">
      {/* Desktop Sidebar Navigation */}
      <aside className={`sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
        <div className="sidebar-top-row">
          <div className="sidebar-brand">
            <span style={{ fontSize: '1.2rem' }}>🤙</span>
            <span className="brand-name">Buddy</span>
          </div>
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? '◀' : '☰'}
          </button>
        </div>

        <nav className="nav-menu">
          <button
            id="nav-chat"
            className={`nav-link ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ strokeWidth: 1.8, flexShrink: 0 }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>Conversation</span>
          </button>
          <button
            id="nav-dashboard"
            className={`nav-link ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ strokeWidth: 1.8, flexShrink: 0 }}>
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            <span>Analytics</span>
          </button>
          <button
            id="nav-settings"
            className={`nav-link ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ strokeWidth: 1.8, flexShrink: 0 }}>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>Configuration</span>
          </button>
          <button
            id="nav-pantry"
            className={`nav-link ${activeTab === 'pantry' ? 'active' : ''}`}
            onClick={() => setActiveTab('pantry')}
          >
            <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>🍲</span>
            <span>Pantry & Cookbook</span>
          </button>
          <button
            id="nav-vision"
            className={`nav-link ${activeTab === 'vision' ? 'active' : ''}`}
            onClick={() => setActiveTab('vision')}
          >
            <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>📸</span>
            <span>Vision Scanner Test</span>
          </button>
        </nav>

        {isReady && (
          <div className="connection-status">
            <div className={`status-indicator ${hasKey ? 'connected' : 'disconnected'}`} />
            <span>{hasKey ? 'Supabase Connected' : 'Setup Required'}</span>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <div className="main-panel">
        {/* Mobile Top Header (Hidden on Desktop) */}
        <header className="mobile-header">
          <span style={{ fontSize: '1.2rem', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
            Buddy
          </span>
          {isReady && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' }}>
              <div className={`status-indicator ${hasKey ? 'connected' : 'disconnected'}`} />
              <span>{hasKey ? 'Cloud' : 'Offline'}</span>
            </div>
          )}
        </header>

        {/* Dynamic Viewport */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {activeTab === 'chat' && <ChatView />}
          {activeTab === 'dashboard' && <DashboardView />}
          {activeTab === 'settings' && <SettingsPanel />}
          {activeTab === 'pantry' && <PantryCookbookView />}
          {activeTab === 'vision' && <VisionTestView />}
        </div>

        {/* Mobile Bottom Tab Navigation */}
        <nav className="mobile-nav-bar">
          <button
            className={`mobile-nav-btn ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            <span className="mobile-nav-icon">💬</span>
            <span>Chat</span>
          </button>
          <button
            className={`mobile-nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <span className="mobile-nav-icon">📊</span>
            <span>Analytics</span>
          </button>
          <button
            className={`mobile-nav-btn ${activeTab === 'pantry' ? 'active' : ''}`}
            onClick={() => setActiveTab('pantry')}
          >
            <span className="mobile-nav-icon">🍲</span>
            <span>Pantry</span>
          </button>
          <button
            className={`mobile-nav-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <span className="mobile-nav-icon">⚙️</span>
            <span>Settings</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
