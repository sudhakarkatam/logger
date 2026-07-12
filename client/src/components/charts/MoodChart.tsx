import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import type { Entry, MoodData } from '../../types';

interface Props {
  entries: Entry[];
}

export default function MoodChart({ entries }: Props) {
  const chartData = entries
    .sort((a, b) => a.entry_time.localeCompare(b.entry_time))
    .map(entry => {
      const data = entry.data as unknown as MoodData;
      return {
        time: new Date(entry.entry_time).toLocaleDateString('en-US', {
          weekday: 'short',
          hour: 'numeric',
        }),
        mood: data?.mood || 'neutral',
        intensity: data?.intensity || 5,
        notes: data?.notes || '',
        rawTime: entry.entry_time,
      };
    });

  // Average mood per day
  const avgByDay: Record<string, { total: number; count: number; moods: string[] }> = {};
  entries.forEach(entry => {
    const day = entry.entry_time.split('T')[0];
    const data = entry.data as unknown as MoodData;
    if (!avgByDay[day]) avgByDay[day] = { total: 0, count: 0, moods: [] };
    avgByDay[day].total += data?.intensity || 5;
    avgByDay[day].count++;
    avgByDay[day].moods.push(data?.mood || 'neutral');
  });

  const avgData = Object.entries(avgByDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, info]) => ({
      date: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
      avgIntensity: Math.round((info.total / info.count) * 10) / 10,
      dominantMood: info.moods.sort((a, b) =>
        info.moods.filter(m => m === b).length - info.moods.filter(m => m === a).length
      )[0],
    }));

  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <div className="analytics-card-title">
          <span style={{ fontSize: '1.3rem' }}>😊</span>
          Mood Trend
        </div>
        <span className="card-title-badge">{entries.length} entries</span>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={avgData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
          <defs>
            <linearGradient id="moodGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#fbbf24" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="date" tick={{ fill: '#8b949e', fontSize: 12 }} axisLine={false} />
          <YAxis domain={[0, 10]} tick={{ fill: '#8b949e', fontSize: 12 }} axisLine={false} />
          <Tooltip
            contentStyle={{
              background: '#1c2333',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              color: '#e6edf3',
              fontSize: 13,
            }}
            formatter={(value: number, name: string) => [value, 'Intensity']}
          />
          <Area
            type="monotone"
            dataKey="avgIntensity"
            stroke="#fbbf24"
            strokeWidth={2}
            fill="url(#moodGradient)"
            dot={{ fill: '#fbbf24', r: 4 }}
            activeDot={{ r: 6 }}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Mood labels */}
      <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {avgData.map((d, i) => (
          <span key={i} style={{
            padding: '2px 10px',
            background: 'rgba(251, 191, 36, 0.1)',
            border: '1px solid rgba(251, 191, 36, 0.2)',
            borderRadius: 999,
            fontSize: '0.75rem',
            color: '#fbbf24',
          }}>
            {d.date}: {d.dominantMood}
          </span>
        ))}
      </div>
    </div>
  );
}
