'use client';

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { formatMoney } from '@/lib/money';

export interface CategoryBreakdownRow {
  _id: string;
  total: number;
  count: number;
}

interface CategoryChartProps {
  data: CategoryBreakdownRow[];
  currency: string;
}

// A small categorical palette built from the design system's existing tokens (teal primary plus
// the semantic status colors), cycled with decreasing opacity for any categories beyond six —
// consistent with DESIGN.md rather than inventing new hardcoded hex colors.
const PALETTE = [
  'hsl(var(--primary))',
  'hsl(var(--warning))',
  'hsl(var(--success))',
  'hsl(var(--destructive))',
  'hsl(var(--muted-foreground))',
  'hsl(var(--primary) / 0.5)',
  'hsl(var(--warning) / 0.5)',
  'hsl(var(--success) / 0.5)',
];

export function CategoryChart({ data, currency }: CategoryChartProps) {
  if (data.length === 0) {
    return <p className="py-16 text-center text-sm text-muted-foreground">No expenses recorded in this period yet.</p>;
  }

  const chartData = data.map((row) => ({ name: row._id || 'Uncategorized', value: row.total }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} paddingAngle={2}>
          {chartData.map((entry, index) => (
            <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) => formatMoney(value, currency)}
          contentStyle={{
            background: 'hsl(var(--popover))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
