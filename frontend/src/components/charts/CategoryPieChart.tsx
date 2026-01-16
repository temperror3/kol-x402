import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import type { Category } from '../../types';

interface CategoryPieChartProps {
  data: Record<Category | 'UNCATEGORIZED', number>;
}

const COLORS: Record<Category | 'UNCATEGORIZED', string> = {
  KOL: '#8b5cf6',
  DEVELOPER: '#3b82f6',
  ACTIVE_USER: '#10b981',
  UNCATEGORIZED: '#94a3b8',
};

const LABELS: Record<Category | 'UNCATEGORIZED', string> = {
  KOL: 'KOL',
  DEVELOPER: 'Developer',
  ACTIVE_USER: 'Active User',
  UNCATEGORIZED: 'Uncategorized',
};

export default function CategoryPieChart({ data }: CategoryPieChartProps) {
  const chartData = Object.entries(data)
    .filter(([_, value]) => value > 0)
    .map(([key, value]) => ({
      name: LABELS[key as Category | 'UNCATEGORIZED'],
      value,
      color: COLORS[key as Category | 'UNCATEGORIZED'],
    }));

  const total = chartData.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Category Distribution</h3>
          <p className="text-sm text-slate-500">Breakdown by user type</p>
        </div>
        <div className="px-3 py-1.5 bg-slate-100 rounded-lg text-sm font-medium text-slate-600">
          {total} total
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={70}
            outerRadius={110}
            paddingAngle={3}
            dataKey="value"
            strokeWidth={0}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: 'white',
              border: 'none',
              borderRadius: '12px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
              padding: '12px 16px',
            }}
            formatter={(value: number | string | undefined) => [
              <span key="value" className="font-semibold">{value ?? 0} accounts</span>,
              'Count',
            ]}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(value) => (
              <span className="text-sm text-slate-600">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
