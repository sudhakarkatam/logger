import { useState, useEffect } from 'react';
import { getTimelineEntries } from '../api';
import type { Entry, Category } from '../types';
import { CATEGORY_META } from '../types';

export default function TimelineView() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const availableCategories = [
    { id: 'meal', label: '🍲 Meals' },
    { id: 'expense', label: '💳 Spendings' },
    { id: 'sleep', label: '😴 Sleep' },
    { id: 'exercise', label: '🏃 Exercise' },
    { id: 'mood', label: '🧠 Mood' },
    { id: 'water', label: '💧 Water' },
    { id: 'reminder', label: '⏰ Reminders' },
    { id: 'work', label: '💻 Work' },
    { id: 'book', label: '📚 Books' },
    { id: 'other', label: '💡 Notes' },
  ];

  useEffect(() => {
    loadTimeline();
  }, [startDate, endDate, selectedCategories, searchQuery]);

  const loadTimeline = async () => {
    try {
      setLoading(true);
      setError('');

      const start = startDate ? `${startDate}T00:00:00.000Z` : undefined;
      const end = endDate ? `${endDate}T23:59:59.999Z` : undefined;

      const res = await getTimelineEntries(1, start, end, selectedCategories, searchQuery);
      setEntries(res.entries || []);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch timeline logs.');
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (catId: string) => {
    setSelectedCategories(prev =>
      prev.includes(catId)
        ? prev.filter(c => c !== catId)
        : [...prev, catId]
    );
  };

  const handleTagClick = (tag: string) => {
    setSearchQuery(tag);
  };

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setSelectedCategories([]);
    setSearchQuery('');
  };

  const renderCardData = (entry: Entry) => {
    if (!entry.data) return null;
    const items = [];

    if (entry.category === 'meal') {
      if (entry.data.meal_type) items.push(<span key="type" className="meta-badge-text">Type: <strong>{String(entry.data.meal_type)}</strong></span>);
      if (entry.data.items) items.push(<span key="items" className="meta-badge-text">Items: {Array.isArray(entry.data.items) ? entry.data.items.join(', ') : String(entry.data.items)}</span>);
      if (entry.data.calories) items.push(<span key="cal" className="meta-badge-text">Est. Cal: <strong>{String(entry.data.calories)} kcal</strong></span>);
    } else if (entry.category === 'expense') {
      if (entry.data.amount) items.push(<span key="amt" className="meta-badge-text" style={{ color: 'var(--cat-expense)', fontWeight: 600 }}>Amount: ₹{String(entry.data.amount)}</span>);
      if (entry.data.item) items.push(<span key="item" className="meta-badge-text">Item: {String(entry.data.item)}</span>);
    } else if (entry.category === 'sleep') {
      if (entry.data.hours) items.push(<span key="hrs" className="meta-badge-text">Duration: <strong>{String(entry.data.hours)} hours</strong></span>);
    } else if (entry.category === 'exercise') {
      if (entry.data.activity) items.push(<span key="act" className="meta-badge-text">Activity: <strong>{String(entry.data.activity)}</strong></span>);
      if (entry.data.duration_minutes) items.push(<span key="dur" className="meta-badge-text">Duration: {String(entry.data.duration_minutes)} min</span>);
    } else if (entry.category === 'mood') {
      if (entry.data.intensity) items.push(<span key="int" className="meta-badge-text">Intensity: <strong>{String(entry.data.intensity)}/10</strong></span>);
    } else if (entry.category === 'water') {
      if (entry.data.ml) items.push(<span key="ml" className="meta-badge-text">Intake: <strong>{String(entry.data.ml)} ml</strong></span>);
    } else if (entry.category === 'work') {
      if (entry.data.duration_hours) items.push(<span key="work-hrs" className="meta-badge-text">Time: <strong>{String(entry.data.duration_hours)} hrs</strong></span>);
    }

    if (items.length === 0) return null;
    return <div className="timeline-card-data">{items}</div>;
  };

  return (
    <div className="settings-viewport" style={{ paddingBottom: '40px' }}>
      <h3 className="settings-box-title" style={{ fontFamily: 'var(--font-serif)', fontSize: '1.65rem' }}>📅 Smart Timeline & Memories</h3>

      {/* Filters Panel */}
      <div className="settings-form" style={{ padding: '16px', borderRadius: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-muted)', marginBottom: '20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>

          {/* Search bar */}
          <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="form-label" style={{ fontSize: '0.8rem' }}>Search Logs or #tags</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. coffee, #react, weekend..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ padding: '8px 12px' }}
            />
          </div>

          {/* Date Picker Start */}
          <div style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="form-label" style={{ fontSize: '0.8rem' }}>Start Date</label>
            <input
              type="date"
              className="form-input"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              style={{ padding: '7px 10px' }}
            />
          </div>

          {/* Date Picker End */}
          <div style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="form-label" style={{ fontSize: '0.8rem' }}>End Date</label>
            <input
              type="date"
              className="form-input"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              style={{ padding: '7px 10px' }}
            />
          </div>
        </div>

        {/* Category Pills Multi-select */}
        <div style={{ marginBottom: '16px' }}>
          <label className="form-label" style={{ fontSize: '0.8rem', marginBottom: '8px', display: 'block' }}>Filter Categories</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {availableCategories.map(cat => {
              const active = selectedCategories.includes(cat.id);
              return (
                <button
                  key={cat.id}
                  onClick={() => toggleCategory(cat.id)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '20px',
                    fontSize: '0.78rem',
                    border: '1px solid ' + (active ? 'var(--text-main)' : 'var(--border-muted)'),
                    background: active ? 'var(--text-main)' : 'transparent',
                    color: active ? 'var(--bg-primary)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)'
                  }}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Action controllers */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-dark)' }}>
            Found {entries.length} log{entries.length === 1 ? '' : 's'}
          </span>
          {(startDate || endDate || selectedCategories.length > 0 || searchQuery) && (
            <button
              onClick={clearFilters}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--cat-expense)',
                fontSize: '0.8rem',
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Main Feed Scroll Area */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          ⏳ Loading your memory timeline...
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--cat-expense)' }}>
          {error}
        </div>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 40px', background: 'var(--bg-capsule)', borderRadius: '12px', color: 'var(--text-muted)', border: '1px dashed var(--border-muted)' }}>
          🔍 No logs match your current filters. Try relaxing filters or log something new!
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {entries.map(entry => {
            const meta = CATEGORY_META[entry.category as Category] || { icon: '💡', label: 'Other', color: 'var(--cat-other)' };
            const timestampStr = new Date(entry.entry_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const dateStr = new Date(entry.entry_time).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

            return (
              <div
                key={entry.id}
                className="timeline-card"
                style={{
                  background: 'var(--bg-capsule)',
                  borderLeft: `4px solid ${meta.color}`,
                  borderRadius: '8px',
                  padding: '14px',
                  border: '1px solid var(--border-muted)',
                  borderLeftWidth: '4px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                {/* Card Header info */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.1rem' }}>{meta.icon}</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>{meta.label}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    <span>{dateStr}</span>
                    <span>•</span>
                    <span>{timestampStr}</span>
                  </div>
                </div>

                {/* Raw logs text content */}
                <div style={{ fontSize: '0.92rem', color: 'var(--text-main)', lineHeight: '1.4', whiteSpace: 'pre-wrap' }}>
                  {entry.raw_text}
                </div>

                {/* Render pre-extracted data metadata */}
                {renderCardData(entry)}

                {/* Render tags badges */}
                {entry.tags && entry.tags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                    {entry.tags.map((tag: string, idx: number) => (
                      <button
                        key={idx}
                        onClick={() => handleTagClick(tag)}
                        style={{
                          fontSize: '0.72rem',
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid var(--border-muted)',
                          color: 'var(--cat-exercise)',
                          borderRadius: '12px',
                          padding: '2px 8px',
                          cursor: 'pointer',
                          transition: 'all var(--transition-fast)'
                        }}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
