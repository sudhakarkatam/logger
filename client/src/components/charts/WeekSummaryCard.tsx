import type { WeekData } from '../../types';
import { CATEGORY_META } from '../../types';

interface Props {
  stats: WeekData['stats'];
  byDay: WeekData['byDay'];
}

export default function WeekSummaryCard({ stats, byDay }: Props) {
  const busiestDay = Object.entries(byDay)
    .sort(([, a], [, b]) => b.length - a.length)[0];

  const busiestDayLabel = busiestDay
    ? new Date(busiestDay[0]).toLocaleDateString('en-US', { weekday: 'long' })
    : '—';

  return (
    <div className="analytics-card analytics-summary-banner">
      <div className="analytics-card-header">
        <div className="analytics-card-title">
          <span style={{ fontSize: '1.3rem' }}>📋</span>
          Overview Stats
        </div>
      </div>

      <div className="summary-flex">
        <div className="summary-stat-cell">
          <div className="summary-stat-val">{stats.totalEntries}</div>
          <div className="summary-stat-lbl">Total Logs</div>
        </div>

        <div className="summary-stat-cell">
          <div className="summary-stat-val">{stats.daysLogged}</div>
          <div className="summary-stat-lbl">Days Active</div>
        </div>

        <div className="summary-stat-cell">
          <div className="summary-stat-val">{stats.categories.length}</div>
          <div className="summary-stat-lbl">Categories</div>
        </div>

        <div className="summary-stat-cell">
          <div className="summary-stat-val" style={{ fontSize: '1.4rem', marginTop: '10px' }}>
            {stats.mostActiveCategory
              ? `${CATEGORY_META[stats.mostActiveCategory as keyof typeof CATEGORY_META]?.icon || '📝'} ${stats.mostActiveCategory}`
              : '—'}
          </div>
          <div className="summary-stat-lbl">Most Logged</div>
        </div>

        <div className="summary-stat-cell">
          <div className="summary-stat-val" style={{ fontSize: '1.4rem', marginTop: '10px' }}>
            {busiestDayLabel}
          </div>
          <div className="summary-stat-lbl">Busiest Day</div>
        </div>
      </div>

      {/* Category progress bar */}
      {stats.categories.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div className="mini-progress-track">
            {stats.categories
              .sort((a, b) => b.count - a.count)
              .map((cat, i) => {
                const meta = CATEGORY_META[cat.category as keyof typeof CATEGORY_META];
                const pct = (cat.count / stats.totalEntries) * 100;
                return (
                  <div
                    key={i}
                    className="mini-progress-fill"
                    style={{
                      width: `${pct}%`,
                      background: meta?.color || 'var(--cat-other)',
                    }}
                    title={`${cat.category}: ${cat.count}`}
                  />
                );
              })}
          </div>
          <div className="legend-group">
            {stats.categories
              .sort((a, b) => b.count - a.count)
              .map((cat, i) => {
                const meta = CATEGORY_META[cat.category as keyof typeof CATEGORY_META];
                return (
                  <div key={i} className="legend-dot-item">
                    <div className="legend-color-indicator" style={{ background: meta?.color || 'var(--cat-other)' }} />
                    {meta?.label || cat.category} ({cat.count})
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
