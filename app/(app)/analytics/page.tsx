'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Download } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { formatMoney, percentChange } from '@/lib/money';
import type { Business, PublicUser } from '@/lib/types';
// Type-only imports: lib/financials.ts itself pulls in the server-only Mongo driver, but a
// `import type` is erased at compile time, so no server code ends up in this client bundle.
import type { MarginRow, PeriodPoint, ProfitLoss } from '@/lib/financials';

// Mirrors lib/auth.ts's canViewFinancials — server-only module (imports next/headers), so this
// client component replicates the exact rule instead of importing it. Keep in sync.
function canViewFinancialsClient(role: string): boolean {
  return role === 'owner' || role === 'manager' || role === 'accountant';
}

interface ExpenseBreakdownRow {
  _id: string;
  total: number;
  count: number;
}

function priorRangeOf(from: string, to: string): { from: string; to: string } {
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  const length = Math.max(86400000, toMs - fromMs);
  return { from: new Date(fromMs - length).toISOString(), to: new Date(fromMs).toISOString() };
}

function DeltaBadge({ current, prior, invert = false }: { current: number; prior: number; invert?: boolean }) {
  const change = percentChange(current, prior);
  if (change === null) return <Badge variant="secondary">New</Badge>;
  if (change === 0) return <Badge variant="secondary">No change</Badge>;
  const isIncrease = change > 0;
  const isGood = invert ? !isIncrease : isIncrease;
  return (
    <Badge variant={isGood ? 'success' : 'destructive'}>
      {isIncrease ? '+' : ''}
      {change}%
    </Badge>
  );
}

export default function AnalyticsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [me, setMe] = useState<{ user: PublicUser; business: Business } | null>(null);
  const [compare, setCompare] = useState(false);

  const { from, to } = useMemo(() => {
    const now = new Date();
    const toParam = searchParams.get('to');
    const fromParam = searchParams.get('from');
    return {
      to: toParam || now.toISOString(),
      from: fromParam || new Date(now.getTime() - 30 * 86400000).toISOString(),
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

  function applyRange() {
    const params = new URLSearchParams(searchParams.toString());
    params.set('from', new Date(draftFrom).toISOString());
    params.set('to', new Date(`${draftTo}T23:59:59.999`).toISOString());
    router.replace(`${pathname}?${params.toString()}`);
  }

  const prior = useMemo(() => priorRangeOf(from, to), [from, to]);
  const currency = me?.business.currency ?? 'USD';
  const role = me?.user.role ?? 'staff';
  const canView = canViewFinancialsClient(role);

  function exportUrl(type: 'profit-loss' | 'revenue' | 'expenses'): string {
    return `/api/reports/${type}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&format=csv`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Financial analytics</h1>
        <p className="text-sm text-muted-foreground">Profit &amp; loss, revenue, expenses, and margins over time.</p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="from-date" className="text-xs">
                From
              </Label>
              <Input id="from-date" type="date" value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to-date" className="text-xs">
                To
              </Label>
              <Input id="to-date" type="date" value={draftTo} onChange={(e) => setDraftTo(e.target.value)} className="w-40" />
            </div>
            <Button onClick={applyRange}>Apply</Button>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="compare-toggle" checked={compare} onCheckedChange={setCompare} />
            <Label htmlFor="compare-toggle" className="font-normal text-sm">
              Compare to prior period
            </Label>
          </div>
        </CardContent>
      </Card>

      {!canView ? (
        <EmptyState
          title="Limited access"
          description="Financial analytics are visible to owners, managers, and accountants."
        />
      ) : (
        <Tabs defaultValue="pnl">
          <TabsList>
            <TabsTrigger value="pnl">P&amp;L</TabsTrigger>
            <TabsTrigger value="revenue">Revenue</TabsTrigger>
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
            <TabsTrigger value="margins">Margins</TabsTrigger>
          </TabsList>

          <TabsContent value="pnl">
            <PnlTab from={from} to={to} prior={prior} compare={compare} currency={currency} exportUrl={exportUrl('profit-loss')} />
          </TabsContent>
          <TabsContent value="revenue">
            <RevenueTab from={from} to={to} prior={prior} compare={compare} currency={currency} exportUrl={exportUrl('revenue')} />
          </TabsContent>
          <TabsContent value="expenses">
            <ExpensesTab from={from} to={to} prior={prior} compare={compare} currency={currency} exportUrl={exportUrl('expenses')} />
          </TabsContent>
          <TabsContent value="margins">
            <MarginsTab from={from} to={to} prior={prior} compare={compare} currency={currency} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

interface TabProps {
  from: string;
  to: string;
  prior: { from: string; to: string };
  compare: boolean;
  currency: string;
  exportUrl?: string;
}

function ExportButton({ url }: { url: string }) {
  return (
    <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => window.open(url, '_blank')}>
      <Download className="h-3.5 w-3.5" /> Export CSV
    </Button>
  );
}

// ---------------------------------------------------------------------------
// P&L tab
// ---------------------------------------------------------------------------

function PnlTab({ from, to, prior, compare, currency, exportUrl }: TabProps) {
  const [data, setData] = useState<ProfitLoss | null>(null);
  const [priorData, setPriorData] = useState<ProfitLoss | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const fetchOne = (f: string, t: string) =>
      fetch(`/api/analytics/profit-loss?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}`).then(async (res) => {
        if (!res.ok) throw new Error('Could not load profit & loss.');
        return (await res.json()) as ProfitLoss;
      });

    Promise.all([fetchOne(from, to), compare ? fetchOne(prior.from, prior.to) : Promise.resolve(null)])
      .then(([current, priorRes]) => {
        if (cancelled) return;
        setData(current);
        setPriorData(priorRes);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load profit & loss.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, prior, compare]);

  if (loading) return <Skeleton className="mt-4 h-80" />;
  if (error) return <ErrorState className="mt-4" message={error} />;
  if (!data) return <EmptyState className="mt-4" title="No data" description="No profit & loss data for this period." />;

  const chartData = [
    { name: 'Revenue', current: data.revenue, prior: priorData?.revenue },
    { name: 'COGS', current: data.cogs, prior: priorData?.cogs },
    { name: 'Gross profit', current: data.grossProfit, prior: priorData?.grossProfit },
    { name: 'Expenses', current: data.expenses, prior: priorData?.expenses },
    { name: 'Net profit', current: data.netProfit, prior: priorData?.netProfit },
  ];

  return (
    <div className="mt-4 space-y-4">
      <div className="flex justify-end">
        <ExportButton url={exportUrl!} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Revenue" value={formatMoney(data.revenue, currency)} delta={priorData && <DeltaBadge current={data.revenue} prior={priorData.revenue} />} />
        <Stat label="COGS" value={formatMoney(data.cogs, currency)} delta={priorData && <DeltaBadge current={data.cogs} prior={priorData.cogs} invert />} />
        <Stat label="Gross profit" value={formatMoney(data.grossProfit, currency)} delta={priorData && <DeltaBadge current={data.grossProfit} prior={priorData.grossProfit} />} />
        <Stat label="Gross margin" value={`${data.grossMarginPercent}%`} />
        <Stat label="Net profit" value={formatMoney(data.netProfit, currency)} delta={priorData && <DeltaBadge current={data.netProfit} prior={priorData.netProfit} />} />
        <Stat label="Net margin" value={`${data.netMarginPercent}%`} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Revenue, COGS &amp; profit</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => formatMoney(v, currency)} width={90} />
              <Tooltip formatter={(v: number) => formatMoney(v, currency)} />
              <Bar dataKey="current" name="Current period" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              {compare ? <Bar dataKey="prior" name="Prior period" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} /> : null}
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Revenue tab
// ---------------------------------------------------------------------------

function RevenueTab({ from, to, prior, compare, currency, exportUrl }: TabProps) {
  const [points, setPoints] = useState<PeriodPoint[] | null>(null);
  const [priorPoints, setPriorPoints] = useState<PeriodPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const fetchOne = (f: string, t: string) =>
      fetch(`/api/analytics/revenue?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}`).then(async (res) => {
        if (!res.ok) throw new Error('Could not load revenue.');
        return (await res.json()) as PeriodPoint[];
      });

    Promise.all([fetchOne(from, to), compare ? fetchOne(prior.from, prior.to) : Promise.resolve(null)])
      .then(([current, priorRes]) => {
        if (cancelled) return;
        setPoints(current);
        setPriorPoints(priorRes);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load revenue.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, prior, compare]);

  if (loading) return <Skeleton className="mt-4 h-80" />;
  if (error) return <ErrorState className="mt-4" message={error} />;
  if (!points || points.length === 0) {
    return <EmptyState className="mt-4" title="No revenue yet" description="No sales recorded for this period." />;
  }

  const totalRevenue = points.reduce((s, p) => s + p.revenue, 0);
  const priorTotalRevenue = priorPoints?.reduce((s, p) => s + p.revenue, 0) ?? null;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex justify-end">
        <ExportButton url={exportUrl!} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          label="Total revenue"
          value={formatMoney(totalRevenue, currency)}
          delta={priorTotalRevenue !== null && <DeltaBadge current={totalRevenue} prior={priorTotalRevenue} />}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Revenue vs. expenses</CardTitle>
          <CardDescription>By period</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="period" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => formatMoney(v, currency)} width={90} />
              <Tooltip formatter={(v: number) => formatMoney(v, currency)} />
              <Line type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="expenses" name="Expenses" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expenses tab
// ---------------------------------------------------------------------------

function ExpensesTab({ from, to, prior, compare, currency, exportUrl }: TabProps) {
  const [rows, setRows] = useState<ExpenseBreakdownRow[] | null>(null);
  const [priorRows, setPriorRows] = useState<ExpenseBreakdownRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const fetchOne = (f: string, t: string) =>
      fetch(`/api/analytics/expenses?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}`).then(async (res) => {
        if (!res.ok) throw new Error('Could not load expenses.');
        return (await res.json()) as ExpenseBreakdownRow[];
      });

    Promise.all([fetchOne(from, to), compare ? fetchOne(prior.from, prior.to) : Promise.resolve(null)])
      .then(([current, priorRes]) => {
        if (cancelled) return;
        setRows(current);
        setPriorRows(priorRes);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load expenses.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, prior, compare]);

  if (loading) return <Skeleton className="mt-4 h-80" />;
  if (error) return <ErrorState className="mt-4" message={error} />;
  if (!rows || rows.length === 0) {
    return <EmptyState className="mt-4" title="No expenses yet" description="No expenses recorded for this period." />;
  }

  const total = rows.reduce((s, r) => s + r.total, 0);
  const priorTotal = priorRows?.reduce((s, r) => s + r.total, 0) ?? null;
  const chartData = rows.map((r) => ({ name: r._id, total: r.total }));

  return (
    <div className="mt-4 space-y-4">
      <div className="flex justify-end">
        <ExportButton url={exportUrl!} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          label="Total expenses"
          value={formatMoney(total, currency)}
          delta={priorTotal !== null && <DeltaBadge current={total} prior={priorTotal} invert />}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Expenses by category</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => formatMoney(v, currency)} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={120} />
              <Tooltip formatter={(v: number) => formatMoney(v, currency)} />
              <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r._id}>
                  <TableCell>{r._id}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{r.count}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatMoney(r.total, currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Margins tab — no matching REPORT_TYPES entry, so no export button here.
// ---------------------------------------------------------------------------

function MarginsTab({ from, to, prior, compare, currency }: TabProps) {
  const [by, setBy] = useState<'product' | 'category'>('product');
  const [rows, setRows] = useState<MarginRow[] | null>(null);
  const [priorRows, setPriorRows] = useState<MarginRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const fetchOne = (f: string, t: string) =>
      fetch(`/api/analytics/margins?by=${by}&from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}`).then(async (res) => {
        if (!res.ok) throw new Error('Could not load margins.');
        return (await res.json()) as MarginRow[];
      });

    Promise.all([fetchOne(from, to), compare ? fetchOne(prior.from, prior.to) : Promise.resolve(null)])
      .then(([current, priorRes]) => {
        if (cancelled) return;
        setRows(current);
        setPriorRows(priorRes);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load margins.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, prior, compare, by]);

  const overall = rows ? weightedMargin(rows) : null;
  const priorOverall = priorRows ? weightedMargin(priorRows) : null;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between">
        <Select value={by} onValueChange={(v) => setBy(v as 'product' | 'category')}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="product">By product</SelectItem>
            <SelectItem value="category">By category</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <Skeleton className="h-80" />
      ) : error ? (
        <ErrorState message={error} />
      ) : !rows || rows.length === 0 ? (
        <EmptyState title="No margin data" description="No sales recorded for this period." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat
              label="Overall margin"
              value={overall !== null ? `${overall}%` : '—'}
              delta={priorOverall !== null && overall !== null && <DeltaBadge current={overall} prior={priorOverall} />}
            />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Margin % by {by}</CardTitle>
              <CardDescription>Top 10 by revenue</CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${v}%`} width={50} />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <Bar dataKey="marginPercent" name="Margin %" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{by === 'product' ? 'Product' : 'Category'}</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">COGS</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                    <TableHead className="text-right">Margin %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.key}>
                      <TableCell>{r.label}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{formatMoney(r.revenue, currency)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{formatMoney(r.cogs, currency)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{formatMoney(r.margin, currency)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{r.marginPercent}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function weightedMargin(rows: MarginRow[]): number | null {
  const revenue = rows.reduce((s, r) => s + r.revenue, 0);
  const margin = rows.reduce((s, r) => s + r.margin, 0);
  if (revenue <= 0) return null;
  return Math.round((margin / revenue) * 1000) / 10;
}

function Stat({ label, value, delta }: { label: string; value: string; delta?: ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-lg font-semibold tabular-nums">{value}</span>
          {delta}
        </div>
      </CardContent>
    </Card>
  );
}
