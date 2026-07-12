import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { Entry, SleepData } from '../../types';

interface Props {
  entries: Entry[];
}

const QUALITY_COLORS: Record<string, string> = {
  good: '#a78bfa',
  fair: '#6366f1',
  poor: '#f87171',
};

export default function SleepChart({ entries }: Props) {
  const chartData = entries
    .sort((a, b) => a.entry_time.localeCompare(b.entry_time))
    .map(entry => {
      const data = entry.data as unknown as SleepData;
      const day = entry.entry_time.split('T')[0];
      return {
        date: new Date(day).toLocaleDateString('en-US', { weekday: 'short' }),
        hours: data?.hours || 0,
        quality: data?.quality || 'fair',
      };
    });

  const avgHours = chartData.length > 0
    ? Math.round((chartData.reduce((sum, d) => sum + d.hours, 0) / chartData.length) * 10) / 10
    : 0;

  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <div className="analytics-card-title">
          <span style={{ fontSize: '1.3rem' }}>😴</span>
          Sleep
        </div>
        <span className="card-title-badge">avg {avgHours}h / night</span>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="date" tick={{ fill: '#8b949e', fontSize: 12 }} axisLine={false} />
          <YAxis domain={[0, 12]} tick={{ fill: '#8b949e', fontSize: 12 }} axisLine={false} />
          <Tooltip
            contentStyle={{
              background: '#1c2333',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              color: '#e6edf3',
              fontSize: 13,
            }}
            formatter={(value: number, name: string, props: any) => [
              `${value}h (${props.payload.quality})`,
              'Sleep',
            ]}
          />
          <Bar dataKey="hours" radius={[6, 6, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={index} fill={QUALITY_COLORS[entry.quality] || '#a78bfa'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div style={{ marginTop: 12, display: 'flex', gap: 16, justifyContent: 'center' }}>
        {Object.entries(QUALITY_COLORS).map(([quality, color]) => (
          <div key={quality} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: '#8b949e' }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
            {quality}
          </div>
        ))}
      </div>
    </div>
  );
}
