'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { formatMoney } from '@/lib/money';
import type { Business, PublicUser } from '@/lib/types';
import type { CashFlowPeriod, CashFlowProjection } from '@/lib/financials';

function canViewFinancialsClient(role: string): boolean {
  return role === 'owner' || role === 'manager' || role === 'accountant';
}

interface CashFlowResponse {
  actual: CashFlowPeriod[];
  projection: CashFlowProjection;
}

function runwayTone(runwayMonths: number | null): 'success' | 'warning' | 'destructive' {
  if (runwayMonths === null) return 'success';
  if (runwayMonths < 1) return 'destructive';
  if (runwayMonths < 3) return 'warning';
  return 'success';
}

const TONE_CLASSES: Record<'success' | 'warning' | 'destructive', string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
};
const TONE_TEXT_CLASSES: Record<'success' | 'warning' | 'destructive', string> = {
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
};

export default function CashFlowPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [me, setMe] = useState<{ user: PublicUser; business: Business } | null>(null);
  const [data, setData] = useState<CashFlowResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const { from, to } = useMemo(() => {
    const now = new Date();
    return {
      to: searchParams.get('to') || now.toISOString(),
      from: searchParams.get('from') || new Date(now.getTime() - 90 * 86400000).toISOString(),
    };
  }, [searchParams]);

  const [draftFrom, setDraftFrom] = useState(from.slice(0, 10));
  const [draftTo, setDraftTo] = useState(to.slice(0, 10));

  useEffect(() => {
    setDraftFrom(from.slice(0, 10));
    setDraftTo(to.slice(0, 10));
  }, [from, to]);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((body: { user: PublicUser | null; business: Business | null }) => {
        if (body.user && body.business) setMe({ user: body.user, business: body.business });
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/analytics/cash-flow?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error?.message ?? 'Could not load cash flow.');
        }
        return (await res.json()) as CashFlowResponse;
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load cash flow.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, refreshKey]);

  function applyRange() {
    const params = new URLSearchParams(searchParams.toString());
    params.set('from', new Date(draftFrom).toISOString());
    params.set('to', new Date(`${draftTo}T23:59:59.999`).toISOString());
    router.replace(`${pathname}?${params.toString()}`);
  }

  const currency = me?.business.currency ?? 'USD';
  const role = me?.user.role ?? 'staff';
  const canView = canViewFinancialsClient(role);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Cash flow</h1>
        <p className="text-sm text-muted-foreground">Actual cash movement and a forward-looking projection.</p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="cf-from" className="text-xs">
              From
            </Label>
            <Input id="cf-from" type="date" value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-to" className="text-xs">
              To
            </Label>
            <Input id="cf-to" type="date" value={draftTo} onChange={(e) => setDraftTo(e.target.value)} className="w-40" />
          </div>
          <Button onClick={applyRange}>Apply</Button>
        </CardContent>
      </Card>

      {!canView ? (
        <EmptyState title="Limited access" description="Cash flow is visible to owners, managers, and accountants." />
      ) : loading ? (
        <div className="space-y-4">
          <Skeleton className="h-80" />
          <Skeleton className="h-40" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={() => setRefreshKey((k) => k + 1)} />
      ) : !data || data.actual.length === 0 ? (
        <EmptyState title="No cash flow data" description="No payments or expenses recorded for this period." />
      ) : (
        <CashFlowContent data={data} currency={currency} />
      )}
    </div>
  );
}

function CashFlowContent({ data, currency }: { data: CashFlowResponse; currency: string }) {
  const { actual, projection } = data;

  const chartData = [
    ...actual.map((p) => ({ period: p.period, cashIn: p.cashIn, cashOut: p.cashOut, projected: false })),
    {
      period: 'Projected',
      cashIn: projection.weightedExpectedInflows,
      cashOut: projection.scheduledOutflows,
      projected: true,
    },
  ];

  const tone = runwayTone(projection.runwayMonths);
  const runwayProgressValue =
    projection.runwayMonths === null ? 100 : Math.max(2, Math.min(100, (projection.runwayMonths / 12) * 100));

  const [collectionRate, setCollectionRate] = useState(() =>
    projection.expectedInflows > 0
      ? Math.round((projection.weightedExpectedInflows / projection.expectedInflows) * 100)
      : 100
  );
  const [expenseChange, setExpenseChange] = useState(0);

  const scenarioProjectedCash =
    projection.currentCash +
    projection.expectedInflows * (collectionRate / 100) -
    projection.scheduledOutflows * (1 + expenseChange / 100);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Cash in vs. cash out</CardTitle>
          <CardDescription>
            Actual by period, with the projected next {projection.horizonDays} days shown as a distinct final bar.
          </CardDescription>
        </CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="period" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => formatMoney(v, currency)} width={90} />
              <Tooltip
                formatter={(v: number, name: string) => [formatMoney(v, currency), name]}
                labelFormatter={(label, payload) => (payload?.[0]?.payload?.projected ? `${label} (estimate)` : label)}
              />
              <Bar dataKey="cashIn" name="Cash in" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={`in-${i}`} fill="hsl(var(--success))" fillOpacity={entry.projected ? 0.4 : 1} stroke={entry.projected ? 'hsl(var(--success))' : undefined} strokeDasharray={entry.projected ? '4 3' : undefined} />
                ))}
              </Bar>
              <Bar dataKey="cashOut" name="Cash out" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={`out-${i}`} fill="hsl(var(--destructive))" fillOpacity={entry.projected ? 0.4 : 1} stroke={entry.projected ? 'hsl(var(--destructive))' : undefined} strokeDasharray={entry.projected ? '4 3' : undefined} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="mt-2 text-xs text-muted-foreground">
            The lighter, dashed-outline bars on the right (&ldquo;Projected&rdquo;) are an estimate, not recorded cash movement.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Runway</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {projection.runwayMonths === null ? (
              <p className="text-sm text-success">No burn — cash position is stable.</p>
            ) : (
              <>
                <div className="flex items-baseline justify-between">
                  <span className={`font-mono text-2xl font-semibold tabular-nums ${TONE_TEXT_CLASSES[tone]}`}>
                    {projection.runwayMonths} months
                  </span>
                  <span className="text-xs text-muted-foreground">of runway at current burn</span>
                </div>
                <Progress value={runwayProgressValue} indicatorClassName={TONE_CLASSES[tone]} />
                <p className="text-xs text-muted-foreground">
                  Average monthly burn: {formatMoney(projection.averageMonthlyBurn, currency)}
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Cash position</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Current cash" value={formatMoney(projection.currentCash, currency)} />
            <Row label="Projected cash" value={formatMoney(projection.projectedCash, currency)} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Expected inflows" value={formatMoney(projection.expectedInflows, currency)} caption="Face value of open invoices" />
        <Stat label="Weighted expected inflows" value={formatMoney(projection.weightedExpectedInflows, currency)} caption="Discounted by collection likelihood" />
        <Stat label="Scheduled outflows" value={formatMoney(projection.scheduledOutflows, currency)} caption="Open POs + recurring expenses due" />
        <Stat label="Horizon" value={`${projection.horizonDays} days`} caption="Projection window" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scenario planner</CardTitle>
          <CardDescription>Estimate based on your current numbers — not a new calculation from the server.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <Label htmlFor="collection-rate">Collection rate</Label>
              <span className="font-mono tabular-nums">{collectionRate}%</span>
            </div>
            <input
              id="collection-rate"
              type="range"
              min={0}
              max={100}
              step={1}
              value={collectionRate}
              onChange={(e) => setCollectionRate(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <Label htmlFor="expense-change">Expense change</Label>
              <span className="font-mono tabular-nums">
                {expenseChange > 0 ? '+' : ''}
                {expenseChange}%
              </span>
            </div>
            <input
              id="expense-change"
              type="range"
              min={-50}
              max={50}
              step={1}
              value={expenseChange}
              onChange={(e) => setExpenseChange(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
          <div className="rounded-md border border-dashed border-border bg-muted/40 p-4">
            <p className="text-xs text-muted-foreground">Estimated projected cash</p>
            <p className="font-mono text-2xl font-semibold tabular-nums">{formatMoney(Math.round(scenarioProjectedCash), currency)}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums font-medium">{value}</span>
    </div>
  );
}

function Stat({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-mono text-lg font-semibold tabular-nums">{value}</p>
        {caption ? <p className="text-xs text-muted-foreground">{caption}</p> : null}
      </CardContent>
    </Card>
  );
}
