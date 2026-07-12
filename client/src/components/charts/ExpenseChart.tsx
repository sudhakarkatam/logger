import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { Entry, ExpenseData } from '../../types';

interface Props {
  entries: Entry[];
}

const EXPENSE_COLORS = [
  '#f87171', '#fb923c', '#fbbf24', '#a3e635',
  '#22d3ee', '#818cf8', '#e879f9',
];

export default function ExpenseChart({ entries }: Props) {
  // Group by subcategory
  const subCatMap: Record<string, number> = {};
  let totalAmount = 0;
  let currency = 'INR';

  entries.forEach(entry => {
    const data = entry.data as unknown as ExpenseData;
    const sub = data?.subcategory || 'other';
    const amount = data?.amount || 0;
    subCatMap[sub] = (subCatMap[sub] || 0) + amount;
    totalAmount += amount;
    if (data?.currency) currency = data.currency;
  });

  const pieData = Object.entries(subCatMap)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value }));

  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <div className="analytics-card-title">
          <span style={{ fontSize: '1.3rem' }}>💰</span>
          Expenses
        </div>
        <span className="card-title-badge">{entries.length} transactions</span>
      </div>

      <div style={{ position: 'relative' }}>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={3}
              dataKey="value"
              strokeWidth={0}
            >
              {pieData.map((_, index) => (
                <Cell key={index} fill={EXPENSE_COLORS[index % EXPENSE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: '#1c2333',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: '#e6edf3',
                fontSize: 13,
              }}
              formatter={(value: number) => [`${currency} ${value}`, '']}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* Center total */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '0.7rem', color: '#8b949e', textTransform: 'uppercase', letterSpacing: 1 }}>Total</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#e6edf3' }}>
            {currency} {totalAmount.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Category breakdown */}
      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {pieData.map((item, i) => (
          <span key={i} style={{
            padding: '2px 10px',
            background: `${EXPENSE_COLORS[i % EXPENSE_COLORS.length]}15`,
            border: `1px solid ${EXPENSE_COLORS[i % EXPENSE_COLORS.length]}30`,
            borderRadius: 999,
            fontSize: '0.75rem',
            color: EXPENSE_COLORS[i % EXPENSE_COLORS.length],
          }}>
            {item.name}: {currency} {item.value}
          </span>
        ))}
      </div>
    </div>
  );
}
