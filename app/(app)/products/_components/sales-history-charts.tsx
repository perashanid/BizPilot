'use client';

import { format, parse } from 'date-fns';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { formatMoney } from '@/lib/money';

interface MonthlySalesRow {
  month: string; // "YYYY-MM"
  unitsSold: number;
  revenue: number;
}

function monthLabel(month: string): string {
  try {
    return format(parse(month, 'yyyy-MM', new Date()), 'MMM yyyy');
  } catch {
    return month;
  }
}

/**
 * Two single-series magnitude charts rather than one dual-axis chart — revenue (money) and
 * units sold are different scales/units, and a dual y-axis chart is misleading. Colors are
 * drawn from the app's own CSS variable tokens (a single brand hue at two opacities), not a
 * new categorical palette, since each panel is its own single-series chart.
 */
export function SalesHistoryCharts({ data, currency }: { data: MonthlySalesRow[]; currency: string }) {
  const chartData = data.map((d) => ({ ...d, label: monthLabel(d.month) }));

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Revenue by month</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={0} />
            <Tooltip
              formatter={(value: number) => formatMoney(value, currency)}
              contentStyle={{
                background: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Units sold by month</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={0} />
            <Tooltip
              formatter={(value: number) => `${value} units`}
              contentStyle={{
                background: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Bar dataKey="unitsSold" fill="hsl(var(--primary))" fillOpacity={0.5} radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
