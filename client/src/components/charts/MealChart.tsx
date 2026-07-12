import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { Entry, MealData } from '../../types';

interface Props {
  entries: Entry[];
}

const MEAL_TYPE_COLORS: Record<string, string> = {
  breakfast: '#22d3ee',
  lunch: '#4ade80',
  dinner: '#a855f7',
  snack: '#fbbf24',
};

export default function MealChart({ entries }: Props) {
  // Group meals by day
  const dayMap: Record<string, { breakfast: number; lunch: number; dinner: number; snack: number }> = {};

  entries.forEach(entry => {
    const day = entry.entry_time.split('T')[0];
    if (!dayMap[day]) {
      dayMap[day] = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };
    }
    const data = entry.data as unknown as MealData;
    const mealType = data?.meal_type || 'snack';
    if (mealType in dayMap[day]) {
      dayMap[day][mealType as keyof typeof dayMap[typeof day]]++;
    }
  });

  const chartData = Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, meals]) => ({
      date: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
      ...meals,
      total: meals.breakfast + meals.lunch + meals.dinner + meals.snack,
    }));

  // Get all unique items
  const allItems = entries
    .flatMap(e => ((e.data as unknown as MealData)?.items || []))
    .filter(Boolean);
  const topItems = [...new Set(allItems)].slice(0, 5);

  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <div className="analytics-card-title">
          <span style={{ fontSize: '1.3rem' }}>🍽️</span>
          Meals
        </div>
        <span className="card-title-badge">{entries.length} logged</span>
      </div>

      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="date" tick={{ fill: '#8b949e', fontSize: 12 }} axisLine={false} />
            <YAxis tick={{ fill: '#8b949e', fontSize: 12 }} axisLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                background: '#1c2333',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: '#e6edf3',
                fontSize: 13,
              }}
            />
            <Bar dataKey="breakfast" stackId="meals" fill={MEAL_TYPE_COLORS.breakfast} radius={[0, 0, 0, 0]} />
            <Bar dataKey="lunch" stackId="meals" fill={MEAL_TYPE_COLORS.lunch} radius={[0, 0, 0, 0]} />
            <Bar dataKey="dinner" stackId="meals" fill={MEAL_TYPE_COLORS.dinner} radius={[0, 0, 0, 0]} />
            <Bar dataKey="snack" stackId="meals" fill={MEAL_TYPE_COLORS.snack} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="card-empty">
          <div className="card-empty-icon">🍽️</div>
          <p>No meal data to display</p>
        </div>
      )}

      {topItems.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {topItems.map((item, i) => (
            <span key={i} style={{
              padding: '2px 10px',
              background: 'rgba(74, 222, 128, 0.1)',
              border: '1px solid rgba(74, 222, 128, 0.2)',
              borderRadius: 999,
              fontSize: '0.75rem',
              color: '#4ade80',
            }}>
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
