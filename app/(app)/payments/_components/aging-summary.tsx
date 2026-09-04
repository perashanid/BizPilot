'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoney } from '@/lib/money';
import type { AgingBucket } from '@/lib/financials';

interface AgingSummaryProps {
  title: string;
  description: string;
  summary: AgingBucket | null;
  currency: string;
}

const BUCKETS: { key: keyof Omit<AgingBucket, 'total'>; label: string }[] = [
  { key: 'current', label: 'Current' },
  { key: 'd1to30', label: '1–30 days' },
  { key: 'd31to60', label: '31–60 days' },
  { key: 'd60plus', label: '60+ days' },
];

export function AgingSummary({ title, description, summary, currency }: AgingSummaryProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-sm">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <span className="font-mono text-lg font-semibold tabular-nums">{formatMoney(summary?.total ?? 0, currency)}</span>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {BUCKETS.map((bucket) => (
            <div key={bucket.key} className="rounded-md border border-border p-2 text-center">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{bucket.label}</p>
              <p className="mt-1 font-mono text-sm font-semibold tabular-nums">
                {formatMoney(summary?.[bucket.key] ?? 0, currency)}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
