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

  useEffect(() => {
    loadData();
  }, [days]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getWeekData(1, days);
      setWeekData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
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

  // Build date range string based on full loaded dataset
  const dates = Object.keys(weekData.byDay).sort();
  const startDate = dates.length > 0 
    ? new Date(dates[0]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) 
    : '—';
  const endDate = dates.length > 0 
    ? new Date(dates[dates.length - 1]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) 
    : '—';

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
