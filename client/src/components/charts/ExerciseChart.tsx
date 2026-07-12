import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { Entry, ExerciseData } from '../../types';

interface Props {
  entries: Entry[];
}

export default function ExerciseChart({ entries }: Props) {
  // Group by day
  const dayMap: Record<string, { sessions: number; totalMinutes: number; activities: string[] }> = {};

  entries.forEach(entry => {
    const day = entry.entry_time.split('T')[0];
    const data = entry.data as unknown as ExerciseData;
    if (!dayMap[day]) dayMap[day] = { sessions: 0, totalMinutes: 0, activities: [] };
    dayMap[day].sessions++;
    dayMap[day].totalMinutes += data?.duration_minutes || 30;
    dayMap[day].activities.push(data?.activity || 'exercise');
  });

  const chartData = Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, info]) => ({
      date: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
      minutes: info.totalMinutes,
      sessions: info.sessions,
    }));

  // Count unique activities
  const allActivities = entries.map(e => (e.data as unknown as ExerciseData)?.activity || 'exercise');
  const activityCounts: Record<string, number> = {};
  allActivities.forEach(a => { activityCounts[a] = (activityCounts[a] || 0) + 1; });
  const topActivities = Object.entries(activityCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const totalMinutes = entries.reduce((sum, e) => sum + ((e.data as unknown as ExerciseData)?.duration_minutes || 30), 0);

  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <div className="analytics-card-title">
          <span style={{ fontSize: '1.3rem' }}>🏃</span>
          Exercise
        </div>
        <span className="card-title-badge">{totalMinutes} min total</span>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
          <defs>
            <linearGradient id="exerciseGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#1d4ed8" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="date" tick={{ fill: '#8b949e', fontSize: 12 }} axisLine={false} />
          <YAxis tick={{ fill: '#8b949e', fontSize: 12 }} axisLine={false} />
          <Tooltip
            contentStyle={{
              background: '#1c2333',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              color: '#e6edf3',
              fontSize: 13,
            }}
            formatter={(value: number) => [`${value} min`, 'Duration']}
          />
          <Bar dataKey="minutes" fill="url(#exerciseGradient)" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      {topActivities.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {topActivities.map(([activity, count], i) => (
            <span key={i} style={{
              padding: '2px 10px',
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              borderRadius: 999,
              fontSize: '0.75rem',
              color: '#3b82f6',
            }}>
              {activity} ×{count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
