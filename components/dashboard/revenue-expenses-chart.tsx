'use client';

import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/money';
import type { PeriodPoint } from '@/lib/financials';

// The one piece of the dashboard that must be a client component: Recharts needs a browser
// (ResizeObserver, etc.), and the page itself stays an async Server Component per the parent
// spec's preference for calling lib/financials.ts directly instead of self-fetching the API.
// Both granularities are fetched server-side and handed down as props so the day/month toggle
// here is instant with no extra request.
interface RevenueExpensesChartProps {
  day: PeriodPoint[];
  month: PeriodPoint[];
  currency: string;
}

export function RevenueExpensesChart({ day, month, currency }: RevenueExpensesChartProps) {
  const [granularity, setGranularity] = useState<'day' | 'month'>('month');
  const data = granularity === 'day' ? day : month;

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-1">
        <Button
          size="sm"
          variant={granularity === 'day' ? 'secondary' : 'ghost'}
          onClick={() => setGranularity('day')}
        >
          Day
        </Button>
        <Button
          size="sm"
          variant={granularity === 'month' ? 'secondary' : 'ghost'}
          onClick={() => setGranularity('month')}
        >
          Month
        </Button>
      </div>
      {data.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          No sales or expenses recorded in this period yet.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="period" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              width={48}
              tickFormatter={(v: number) => formatMoney(v, currency)}
            />
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
            <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expenses" name="Expenses" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
