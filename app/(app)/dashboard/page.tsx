import { Suspense } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { TrendingUp, TrendingDown, Sparkles, FileWarning, PackageX, CheckCircle2, Clock } from 'lucide-react';

import { requireSession, canViewFinancials } from '@/lib/auth';
import { getBusiness } from '@/lib/business';
import {
  getProfitLoss,
  getCurrentCashPosition,
  getReceivablesAging,
  getCashFlowProjection,
  getRevenueVsExpensesByPeriod,
  type AgingRow,
} from '@/lib/financials';
import { getInventoryStatus, type LowStockProduct } from '@/lib/copilot/tools';
import { refreshInsights } from '@/lib/insights';
import { col, COLLECTIONS } from '@/lib/db';
import { formatMoney, percentChange } from '@/lib/money';
import type { Sale, Customer, InsightSeverity } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { RevenueExpensesChart } from '@/components/dashboard/revenue-expenses-chart';

interface DashboardPageProps {
  searchParams: { from?: string; to?: string };
}

export default function DashboardPage({ searchParams }: DashboardPageProps) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent searchParams={searchParams} />
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// Data + content — a nested async Server Component so <Suspense> above can show a skeleton
// while this awaits, without making the whole page (or a client component) async.
// ---------------------------------------------------------------------------

async function DashboardContent({ searchParams }: DashboardPageProps) {
  const session = await requireSession();
  const { from, to } = resolveRange(searchParams);
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  const lengthMs = Math.max(1, toMs - fromMs);
  const priorFrom = new Date(fromMs - lengthMs).toISOString();
  const priorTo = new Date(fromMs).toISOString();

  const business = await getBusiness(session.businessId);
  const currency = business?.currency ?? 'USD';

  if (!canViewFinancials(session.role)) {
    const inventoryStatus = await getInventoryStatus(session.businessId);
    return (
      <div className="space-y-6">
        <PageHeader />
        <Card>
          <CardHeader>
            <CardTitle>Limited view</CardTitle>
            <CardDescription>
              Financial figures are visible to owners, managers, and accountants. Here&rsquo;s what&rsquo;s available to
              your role.
            </CardDescription>
          </CardHeader>
        </Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard label="Low stock items" value={String(inventoryStatus.count)} caption="At or below reorder point" />
        </div>
        <AttentionPanel lowStock={inventoryStatus.products} overdueInvoices={[]} currency={currency} />
      </div>
    );
  }

  const [
    current,
    prior,
    cashPosition,
    receivables,
    inventoryStatus,
    cashFlowProjection,
    revenueByMonth,
    revenueByDay,
    insights,
    recentSales,
  ] = await Promise.all([
    getProfitLoss(session.businessId, { from, to }),
    getProfitLoss(session.businessId, { from: priorFrom, to: priorTo }),
    getCurrentCashPosition(session.businessId),
    getReceivablesAging(session.businessId),
    getInventoryStatus(session.businessId),
    getCashFlowProjection(session.businessId),
    getRevenueVsExpensesByPeriod(session.businessId, { from, to }, 'month'),
    getRevenueVsExpensesByPeriod(session.businessId, { from, to }, 'day'),
    refreshInsights(session.businessId),
    (async () => {
      const sales = await col<Sale>(COLLECTIONS.sales);
      return sales.find({ businessId: session.businessId }).sort({ date: -1 }).limit(5).toArray();
    })(),
  ]);

  const customerIds = [...new Set(recentSales.map((s) => s.customerId).filter((id): id is string => Boolean(id)))];
  let customerNameMap = new Map<string, string>();
  if (customerIds.length > 0) {
    const customers = await col<Customer>(COLLECTIONS.customers);
    const docs = await customers.find({ _id: { $in: customerIds }, businessId: session.businessId }).toArray();
    customerNameMap = new Map(docs.map((c) => [c._id, c.name]));
  }

  const topInsights = insights.slice(0, 3);
  const overdueInvoices = receivables.rows.filter((row) => row.bucket !== 'current').slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Revenue"
          value={formatMoney(current.revenue, currency)}
          badge={<DeltaBadge current={current.revenue} prior={prior.revenue} />}
        />
        <KpiCard
          label="Expenses"
          value={formatMoney(current.expenses, currency)}
          badge={<DeltaBadge current={current.expenses} prior={prior.expenses} invert />}
        />
        <KpiCard
          label="Net profit"
          value={formatMoney(current.netProfit, currency)}
          badge={<DeltaBadge current={current.netProfit} prior={prior.netProfit} />}
        />
        <KpiCard label="Cash on hand" value={formatMoney(cashPosition, currency)} caption="As of today" />
        <KpiCard label="Receivables" value={formatMoney(receivables.summary.total, currency)} caption="Total outstanding" />
        <KpiCard label="Low stock items" value={String(inventoryStatus.count)} caption="At or below reorder point" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue vs. expenses</CardTitle>
            <CardDescription>{formatRangeLabel(from, to)}</CardDescription>
          </CardHeader>
          <CardContent>
            <RevenueExpensesChart day={revenueByDay} month={revenueByMonth} currency={currency} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cash flow forecast</CardTitle>
            <CardDescription>Next {cashFlowProjection.horizonDays} days</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ForecastRow label="Current cash" value={formatMoney(cashFlowProjection.currentCash, currency)} />
            <ForecastRow label="Projected cash" value={formatMoney(cashFlowProjection.projectedCash, currency)} />
            <ForecastRow
              label="Runway"
              value={cashFlowProjection.runwayMonths === null ? 'No burn' : `${cashFlowProjection.runwayMonths} months`}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Copilot insights</CardTitle>
              <CardDescription>Top items that need a decision</CardDescription>
            </div>
            <Link href="/copilot?tab=insights" className="text-sm font-medium text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {topInsights.length === 0 ? (
              <EmptyState
                icon={Sparkles}
                title="No insights yet"
                description="Copilot will surface things worth your attention here as data comes in."
              />
            ) : (
              <div className="space-y-3">
                {topInsights.map((insight) => (
                  <Link
                    key={insight._id}
                    href="/copilot?tab=insights"
                    className="block rounded-md border border-border p-3 transition-colors hover:bg-accent/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{insight.title}</p>
                      <Badge variant={severityBadgeVariant(insight.severity)}>{insight.severity}</Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{insight.body}</p>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Last 5 sales</CardDescription>
          </CardHeader>
          <CardContent>
            {recentSales.length === 0 ? (
              <EmptyState icon={Clock} title="No sales yet" description="Recent sales will show up here." />
            ) : (
              <ul className="space-y-3">
                {recentSales.map((sale) => (
                  <li key={sale._id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{sale.orderNumber}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {sale.customerId ? customerNameMap.get(sale.customerId) ?? 'Customer' : 'Walk-in'} &middot;{' '}
                        {format(new Date(sale.date), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-sm tabular-nums">{formatMoney(sale.grandTotal, currency)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <AttentionPanel lowStock={inventoryStatus.products} overdueInvoices={overdueInvoices} currency={currency} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function PageHeader() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Dashboard</h1>
      <p className="text-sm text-muted-foreground">An overview of how the business is doing.</p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  badge,
  caption,
}: {
  label: string;
  value: string;
  badge?: React.ReactNode;
  caption?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-2xl font-semibold tabular-nums">{value}</span>
          {badge}
        </div>
        {caption ? <p className="text-xs text-muted-foreground">{caption}</p> : null}
      </CardContent>
    </Card>
  );
}

/** Percent-change badge. For expenses, pass `invert` since an increase there is bad, not good. */
function DeltaBadge({ current, prior, invert = false }: { current: number; prior: number; invert?: boolean }) {
  const change = percentChange(current, prior);
  if (change === null) {
    return <Badge variant="secondary">New</Badge>;
  }
  if (change === 0) {
    return <Badge variant="secondary">No change</Badge>;
  }
  const isIncrease = change > 0;
  const isGood = invert ? !isIncrease : isIncrease;
  const Icon = isIncrease ? TrendingUp : TrendingDown;
  return (
    <Badge variant={isGood ? 'success' : 'destructive'} className="gap-1">
      <Icon className="h-3 w-3" />
      {Math.abs(change)}%
    </Badge>
  );
}

function ForecastRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium tabular-nums">{value}</span>
    </div>
  );
}

function severityBadgeVariant(severity: InsightSeverity): 'destructive' | 'warning' | 'secondary' {
  if (severity === 'critical') return 'destructive';
  if (severity === 'warning') return 'warning';
  return 'secondary';
}

interface AttentionPanelProps {
  lowStock: LowStockProduct[];
  overdueInvoices: AgingRow[];
  currency: string;
}

function AttentionPanel({ lowStock, overdueInvoices, currency }: AttentionPanelProps) {
  const isEmpty = lowStock.length === 0 && overdueInvoices.length === 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Needs your attention</CardTitle>
        <CardDescription>Overdue invoices and products running low on stock</CardDescription>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <EmptyState
            icon={CheckCircle2}
            title="You're all caught up"
            description="No overdue invoices or low-stock products right now."
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <FileWarning className="h-3.5 w-3.5" /> Overdue invoices
              </p>
              {overdueInvoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No overdue invoices.</p>
              ) : (
                <ul className="space-y-2">
                  {overdueInvoices.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-2 text-sm">
                      <Link href={`/invoices/${row.id}`} className="truncate hover:underline">
                        {row.name}
                      </Link>
                      <span className="shrink-0 font-mono tabular-nums text-destructive">
                        {formatMoney(row.amountDue, currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <PackageX className="h-3.5 w-3.5" /> Low stock
              </p>
              {lowStock.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing is low on stock.</p>
              ) : (
                <ul className="space-y-2">
                  {lowStock.slice(0, 5).map((product) => (
                    <li key={product.sku} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{product.name}</span>
                      <span className="shrink-0 font-mono tabular-nums text-warning">{product.available} left</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 lg:col-span-2" />
        <Skeleton className="h-72" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-56 lg:col-span-2" />
        <Skeleton className="h-56" />
      </div>
      <Skeleton className="h-48" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Date range resolution — mirrors app/api/analytics/dashboard/route.ts, except an inverted
// range is swapped instead of thrown as a validation error: a page render shouldn't hard-fail
// on a bad query string the way an API response can.
// ---------------------------------------------------------------------------

function resolveRange(searchParams: { from?: string; to?: string }): { from: string; to: string } {
  const now = new Date();
  let to = searchParams.to ? new Date(searchParams.to) : now;
  let from = searchParams.from ? new Date(searchParams.from) : new Date(now.getTime() - 30 * 86400000);
  if (Number.isNaN(to.getTime())) to = now;
  if (Number.isNaN(from.getTime())) from = new Date(now.getTime() - 30 * 86400000);
  if (from > to) {
    const swap = from;
    from = to;
    to = swap;
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

function formatRangeLabel(from: string, to: string): string {
  try {
    return `${format(new Date(from), 'MMM d, yyyy')} – ${format(new Date(to), 'MMM d, yyyy')}`;
  } catch {
    return '';
  }
}
