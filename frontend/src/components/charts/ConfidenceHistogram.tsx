import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ConfidenceHistogramProps {
  data: { range: string; count: number }[];
  title?: string;
  color?: string;
}

export default function ConfidenceHistogram({
  data,
  title = 'Confidence Distribution',
  color = '#6366f1',
}: ConfidenceHistogramProps) {
  const safeData = data || [];
  const total = safeData.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          <p className="text-sm text-slate-500">AI confidence score ranges</p>
        </div>
        <div className="px-3 py-1.5 bg-slate-100 rounded-lg text-sm font-medium text-slate-600">
          {total} accounts
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={safeData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="range"
            tick={{ fontSize: 11, fill: '#64748b' }}
            tickLine={false}
            axisLine={{ stroke: '#e2e8f0' }}
            interval={0}
            angle={-45}
            textAnchor="end"
            height={60}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#64748b' }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip
            cursor={{ fill: 'rgba(99, 102, 241, 0.1)' }}
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
            labelFormatter={(label) => `Confidence: ${label}`}
          />
          <Bar
            dataKey="count"
            fill={color}
            radius={[6, 6, 0, 0]}
            maxBarSize={40}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
