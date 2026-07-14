import { useState, useEffect } from 'react';
import { getWeekData } from '../api';
import type { WeekData, Entry } from '../types';
import MealChart from './charts/MealChart';
import MoodChart from './charts/MoodChart';
import ExerciseChart from './charts/ExerciseChart';
import SleepChart from './charts/SleepChart';
import ExpenseChart from './charts/ExpenseChart';
import WeekSummaryCard from './charts/WeekSummaryCard';

export default function DashboardView() {
  const [weekData, setWeekData] = useState<WeekData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [days, setDays] = useState(7);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // AI Coach Digest State
  const [weeklyDigest, setWeeklyDigest] = useState<string | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestError, setDigestError] = useState('');

  useEffect(() => {
    loadData();
  }, [days]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getWeekData(1, days);
      setWeekData(data);
      // Reset digest state when timeframe changes
      setWeeklyDigest(null);
      setDigestError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateDigest = async () => {
    try {
      setDigestLoading(true);
      setDigestError('');
      // Request digest calculation from Edge Function
      const data = await getWeekData(1, days, true);
      if (data.weeklyDigest) {
        setWeeklyDigest(data.weeklyDigest);
      } else {
        setDigestError('No digest could be compiled. Make sure you have active logs.');
      }
    } catch (err) {
      setDigestError(err instanceof Error ? err.message : 'Failed to generate weekly digest');
    } finally {
      setDigestLoading(false);
    }
  };

  const renderMarkdown = (text: string) => {
    const parseInlineStyles = (lineText: string) => {
      const parts = lineText.split('**');
      return parts.map((part, index) => {
        return index % 2 === 1 
          ? <strong key={index} style={{ color: '#fff', fontWeight: 600 }}>{part}</strong> 
          : part;
      });
    };

    return text.split('\n').map((line, i) => {
      const trimmed = line.trim();

      // Headers (e.g. #, ##, ###, ####)
      if (trimmed.startsWith('#')) {
        const depth = trimmed.match(/^#+/)?.[0].length || 1;
        const content = trimmed.replace(/^#+\s+/, '');
        const fontSize = depth === 1 ? '1.35rem' : depth === 2 ? '1.18rem' : depth === 3 ? '1.05rem' : '0.92rem';
        return (
          <div key={i} style={{ 
            fontSize, 
            fontWeight: 700, 
            color: '#fff', 
            marginTop: '20px', 
            marginBottom: '8px',
            borderBottom: depth <= 2 ? '1px solid rgba(255,255,255,0.06)' : 'none',
            paddingBottom: depth <= 2 ? '6px' : '0'
          }}>
            {parseInlineStyles(content)}
          </div>
        );
      }

      // Horizontal rules
      if (trimmed.startsWith('---')) {
        return <hr key={i} style={{ border: 'none', borderBottom: '1px solid rgba(255,255,255,0.08)', margin: '18px 0' }} />;
      }

      // Lists / Bullets (e.g. - list, * list, • list)
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
        const content = trimmed.replace(/^[\-*•]\s+/, '');
        return (
          <div key={i} style={{ display: 'flex', gap: '8px', marginLeft: '12px', marginBottom: '6px', alignItems: 'flex-start' }}>
            <span style={{ color: '#d97706', fontSize: '1.1rem', lineHeight: '1.2' }}>•</span>
            <span style={{ color: '#e5e7eb', flex: 1, fontSize: '0.88rem' }}>{parseInlineStyles(content)}</span>
          </div>
        );
      }

      // Empty spacing
      if (trimmed === '') {
        return <div key={i} style={{ height: '8px' }} />;
      }

      // Paragraph text
      return <p key={i} style={{ margin: '0 0 10px 0', color: '#cbd5e1', fontSize: '0.88rem' }}>{parseInlineStyles(trimmed)}</p>;
    });
  };

  if (loading) {
    return (
      <div className="dashboard-viewport">
        <div className="dashboard-empty-state">
          <div className="empty-state-icon">⏳</div>
          <h3>Loading your analytics...</h3>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-viewport">
        <div className="dashboard-empty-state">
          <div className="empty-state-icon">⚠️</div>
          <h3>Failed to load analytics</h3>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!weekData || weekData.entries.length === 0) {
    return (
      <div className="dashboard-viewport">
        <div className="dashboard-empty-state">
          <div className="empty-state-icon">📊</div>
          <h3>No records found</h3>
          <p>Start logging your day in the Chat window. Your visual summary will generate here automatically.</p>
        </div>
      </div>
    );
  }

  // Extract all unique hashtags and count their frequencies in the loaded dataset
  const allTagsMap: Record<string, number> = {};
  weekData.entries.forEach(entry => {
    (entry.tags || []).forEach(tag => {
      allTagsMap[tag] = (allTagsMap[tag] || 0) + 1;
    });
  });
  const sortedTags = Object.entries(allTagsMap)
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);

  // ── REAL-TIME CLIENT-SIDE FILTERING ──
  const filteredEntries = weekData.entries.filter(entry => {
    // 1. Category Filter
    if (selectedCategory !== 'all' && entry.category !== selectedCategory) {
      return false;
    }
    // 2. Tag Filter
    if (selectedTag && !(entry.tags || []).includes(selectedTag)) {
      return false;
    }
    // 3. Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchesRaw = entry.raw_text?.toLowerCase().includes(q);
      const matchesCategory = entry.category?.toLowerCase().includes(q);
      const matchesData = JSON.stringify(entry.data || {}).toLowerCase().includes(q);
      const matchesTags = (entry.tags || []).some(t => t.toLowerCase().includes(q));
      if (!matchesRaw && !matchesCategory && !matchesData && !matchesTags) {
        return false;
      }
    }
    return true;
  });

  // Calculate dynamic stats, grouped, and byDay values for the filtered dataset
  const getDashboardStats = (entries: Entry[]) => {
    const grouped: Record<string, Entry[]> = {};
    entries.forEach(entry => {
      if (!grouped[entry.category]) {
        grouped[entry.category] = [];
      }
      grouped[entry.category].push(entry);
    });

    const byDay: Record<string, Entry[]> = {};
    entries.forEach(entry => {
      const day = (entry.entry_time || new Date().toISOString()).split('T')[0];
      if (!byDay[day]) {
        byDay[day] = [];
      }
      byDay[day].push(entry);
    });

    const stats = {
      totalEntries: entries.length,
      categories: Object.entries(grouped).map(([category, list]) => ({
        category,
        count: list.length
      })),
      daysLogged: Object.keys(byDay).length,
      mostActiveCategory: Object.entries(grouped).sort((a, b) => b[1].length - a[1].length)[0]?.[0] || null
    };

    return { grouped, byDay, stats };
  };

  const { grouped, byDay, stats } = getDashboardStats(filteredEntries);

  // Build date range string based on queried timeframe window
  const todayObj = new Date();
  const startDateObj = new Date();
  startDateObj.setDate(todayObj.getDate() - days);
  const startDate = startDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endDate = todayObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="dashboard-viewport">
      {/* Dashboard Header */}
      <div className="dashboard-heading-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
        <div>
          <h2 className="dashboard-heading">Analytics Dashboard</h2>
          <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginTop: '4px' }}>
            Period: {startDate} — {endDate} · {weekData.stats.totalEntries} events loaded
          </p>
        </div>
        <div className="range-selector-capsule" style={{ display: 'flex', gap: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', padding: '4px', borderRadius: '24px' }}>
          {[
            { label: '7 Days', val: 7 },
            { label: '30 Days', val: 30 },
            { label: '90 Days', val: 90 }
          ].map(opt => (
            <button
              key={opt.val}
              onClick={() => setDays(opt.val)}
              style={{
                background: days === opt.val ? '#d97706' : 'transparent',
                color: days === opt.val ? '#fff' : '#8b949e',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '0.8rem',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filter and Search Controls Bar */}
      <div className="filter-bar" style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search Query Input */}
          <div style={{ position: 'relative', flex: '1', minWidth: '220px' }}>
            <input
              type="text"
              placeholder="Search keywords or #tags (e.g. oats, #cheatmeal)..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 16px',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.02)',
                color: '#fff',
                fontSize: '0.85rem',
                outline: 'none',
                transition: 'all 0.2s ease'
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#8b949e',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Pills Toggles */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {['all', 'meal', 'sleep', 'expense', 'exercise', 'mood', 'other'].map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  background: selectedCategory === cat ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: selectedCategory === cat ? '#fff' : '#8b949e',
                  border: selectedCategory === cat ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(255,255,255,0.06)',
                  padding: '8px 14px',
                  borderRadius: '10px',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  transition: 'all 0.2s ease'
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic Tag Cloud (Only shown if tags exist) */}
        {sortedTags.length > 0 && (
          <div className="tag-cloud" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', padding: '6px 0', borderTop: '1px solid rgba(255, 255, 255, 0.03)', paddingTop: '12px' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginRight: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Hashtags:</span>
            {sortedTags.map(tag => {
              const isActive = selectedTag === tag;
              return (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(isActive ? null : tag)}
                  style={{
                    background: isActive ? '#d97706' : 'rgba(255,255,255,0.02)',
                    color: isActive ? '#fff' : 'var(--text-muted)',
                    border: isActive ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.05)',
                    padding: '4px 10px',
                    borderRadius: '16px',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  #{tag}
                </button>
              );
            })}
            {selectedTag && (
              <button
                onClick={() => setSelectedTag(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ef4444',
                  fontSize: '0.72rem',
                  cursor: 'pointer',
                  marginLeft: '4px'
                }}
              >
                Clear Filter
              </button>
            )}
          </div>
        )}
      </div>

      {/* Conditional Dashboard Grid */}
      {filteredEntries.length > 0 ? (
        <div className="dashboard-grid-box">
          {/* 📬 AI Coach Digest Section */}
          <div className="coach-digest-card" style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '24px',
            gridColumn: '1 / -1',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.2)',
            backdropFilter: 'blur(8px)',
            transition: 'all 0.3s ease'
          }}>
            {!weeklyDigest && !digestLoading ? (
              <div style={{ textAlign: 'center', padding: '10px 0' }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📬</div>
                <h3 style={{ margin: '0 0 6px 0', fontSize: '1.1rem', fontWeight: 600, color: '#f3f4f6' }}>AI Coach Weekly Digest</h3>
                <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: '#9ca3af', maxWidth: '480px', marginLeft: 'auto', marginRight: 'auto' }}>
                  Let the AI analyze your {days === 7 ? 'weekly' : days === 30 ? 'monthly' : `${days}-day`} calories, sleep patterns, and budget limits to uncover hidden correlations.
                </p>
                <button
                  onClick={handleGenerateDigest}
                  className="generate-digest-btn"
                  style={{
                    background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                    color: '#fff',
                    border: 'none',
                    padding: '10px 24px',
                    borderRadius: '30px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(217, 119, 6, 0.2)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <span>✨ Generate AI Digest</span>
                </button>
                {digestError && (
                  <p style={{ color: '#ef4444', fontSize: '0.78rem', marginTop: '12px', margin: '12px 0 0 0' }}>⚠️ {digestError}</p>
                )}
              </div>
            ) : digestLoading ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div className="digest-loading-shimmer" style={{ display: 'inline-block', width: '40px', height: '40px', borderRadius: '50%', border: '3px solid rgba(217, 119, 6, 0.2)', borderTopColor: '#d97706', animation: 'spin 1s linear infinite', marginBottom: '12px' }}></div>
                <h4 style={{ margin: '0 0 4px 0', color: '#f3f4f6', fontSize: '0.95rem' }}>Analyzing your habits...</h4>
                <p style={{ margin: '0', fontSize: '0.78rem', color: '#9ca3af' }}>Calculating aggregates and generating correlations</p>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', paddingBottom: '12px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.25rem' }}>📬</span>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#f3f4f6' }}>AI Coach Insights</h3>
                  </div>
                  <button
                    onClick={handleGenerateDigest}
                    style={{
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      color: '#d1d5db',
                      padding: '4px 12px',
                      borderRadius: '16px',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    🔄 Refresh
                  </button>
                </div>
                <div 
                  className="weekly-digest-markdown" 
                  style={{ 
                    fontSize: '0.88rem', 
                    lineHeight: '1.6', 
                    color: '#e5e7eb'
                  }}
                >
                  {renderMarkdown(weeklyDigest || '')}
                </div>
                {digestError && (
                  <p style={{ color: '#ef4444', fontSize: '0.78rem', marginTop: '12px', marginBottom: 0 }}>⚠️ {digestError}</p>
                )}
              </div>
            )}
          </div>

          {/* Overview Banner Card */}
          <WeekSummaryCard stats={stats} byDay={byDay} />

          {/* Meals chart */}
          {grouped.meal && grouped.meal.length > 0 && (
            <MealChart entries={grouped.meal} />
          )}

          {/* Mood chart */}
          {grouped.mood && grouped.mood.length > 0 && (
            <MoodChart entries={grouped.mood} />
          )}

          {/* Exercise chart */}
          {grouped.exercise && grouped.exercise.length > 0 && (
            <ExerciseChart entries={grouped.exercise} />
          )}

          {/* Sleep chart */}
          {grouped.sleep && grouped.sleep.length > 0 && (
            <SleepChart entries={grouped.sleep} />
          )}

          {/* Expense chart */}
          {grouped.expense && grouped.expense.length > 0 && (
            <ExpenseChart entries={grouped.expense} />
          )}
        </div>
      ) : (
        <div className="dashboard-empty-state" style={{ marginTop: '40px' }}>
          <div className="empty-state-icon">🔍</div>
          <h3>No matching logs found</h3>
          <p style={{ color: '#8b949e', fontSize: '0.85rem', marginTop: '6px' }}>
            Try clearing your search query or choosing another tag filter.
          </p>
        </div>
      )}
    </div>
  );
}
