'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { Plus, Search, Receipt, TrendingUp, TrendingDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { formatMoney, percentChange } from '@/lib/money';
import type { Business, Expense, Paginated } from '@/lib/types';
import { ExpenseDialog } from './_components/expense-dialog';
import { CategoryChart, type CategoryBreakdownRow } from './_components/category-chart';

function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);
  return debounced;
}

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 86400000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function ExpensesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '');
  const debouncedSearch = useDebouncedValue(searchInput);
  const category = searchParams.get('category') ?? 'all';
  const page = Number(searchParams.get('page') ?? '1');
  const { from, to } = useMemo(() => {
    const fallback = defaultRange();
    return {
      from: searchParams.get('from') ?? fallback.from,
      to: searchParams.get('to') ?? fallback.to,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const [result, setResult] = useState<Paginated<Expense> | null>(null);
  const [breakdown, setBreakdown] = useState<CategoryBreakdownRow[] | null>(null);
  const [priorTotal, setPriorTotal] = useState<number | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(searchParams.get('new') === '1');

  function updateParams(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === '') params.delete(key);
      else params.set(key, value);
    }
    router.replace(`${pathname}?${params.toString()}`);
  }

  useEffect(() => {
    updateParams({ search: debouncedSearch || undefined, page: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => setBusiness(data?.business ?? null));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page || 1));
      params.set('limit', '20');
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (category !== 'all') params.set('category', category);
      params.set('from', from);
      params.set('to', to);
      const res = await fetch(`/api/expenses?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Could not load expenses.');
      setResult(data as Paginated<Expense>);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load expenses.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, category, from, to]);

  const loadCharts = useCallback(async () => {
    setChartLoading(true);
    try {
      const fromMs = new Date(from).getTime();
      const toMs = new Date(to).getTime();
      const lengthMs = Math.max(1, toMs - fromMs);
      const priorFrom = new Date(fromMs - lengthMs).toISOString();
      const priorTo = new Date(fromMs).toISOString();

      const [currentRes, priorRes] = await Promise.all([
        fetch(`/api/analytics/expenses?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
        fetch(`/api/analytics/expenses?from=${encodeURIComponent(priorFrom)}&to=${encodeURIComponent(priorTo)}`),
      ]);
      const currentData = await currentRes.json();
      const priorData = await priorRes.json();
      if (currentRes.ok) setBreakdown(currentData as CategoryBreakdownRow[]);
      if (priorRes.ok) {
        const total = (priorData as CategoryBreakdownRow[]).reduce((sum, row) => sum + row.total, 0);
        setPriorTotal(total);
      }
    } finally {
      setChartLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadCharts();
  }, [loadCharts]);

  const currency = business?.currency ?? 'USD';
  const currentTotal = breakdown?.reduce((sum, row) => sum + row.total, 0) ?? 0;
  const change = priorTotal !== null ? percentChange(currentTotal, priorTotal) : null;
  const categories = breakdown?.map((row) => row._id).filter(Boolean) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Expenses</h1>
          <p className="text-sm text-muted-foreground">Track and categorize business spending.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Add expense
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Spending by category</CardTitle>
            <CardDescription>
              {format(new Date(from), 'MMM d, yyyy')} – {format(new Date(to), 'MMM d, yyyy')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {chartLoading ? <Skeleton className="h-64" /> : <CategoryChart data={breakdown ?? []} currency={currency} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Period over period</CardTitle>
            <CardDescription>vs. the prior equal-length period</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {chartLoading ? (
              <Skeleton className="h-16" />
            ) : (
              <>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">This period</p>
                  <p className="font-mono text-2xl font-semibold tabular-nums">{formatMoney(currentTotal, currency)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {change === null ? (
                    <Badge variant="secondary">No prior data</Badge>
                  ) : change === 0 ? (
                    <Badge variant="secondary">No change</Badge>
                  ) : (
                    <Badge variant={change > 0 ? 'destructive' : 'success'} className="gap-1">
                      {change > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {Math.abs(change)}%
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    Prior: {priorTotal !== null ? formatMoney(priorTotal, currency) : '—'}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search expenses..."
            className="pl-8"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <Select value={category} onValueChange={(v) => updateParams({ category: v === 'all' ? undefined : v, page: undefined })}>
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Date range follows the picker in the top bar.</p>
      </div>

      {loading ? (
        <ExpensesSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !result || result.data.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No expenses recorded"
          description="Add an expense to start tracking spending for this period."
          action={
            <Button onClick={() => setDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add expense
            </Button>
          }
        />
      ) : (
        <>
          <Card className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Recurring</TableHead>
                  <TableHead className="text-right tabular-nums">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.data.map((expense) => (
                  <TableRow key={expense._id}>
                    <TableCell>{format(new Date(expense.date), 'MMM d, yyyy')}</TableCell>
                    <TableCell>{expense.category}</TableCell>
                    <TableCell>{expense.vendor || '—'}</TableCell>
                    <TableCell className="capitalize">{expense.paymentMethod}</TableCell>
                    <TableCell>
                      {expense.recurring ? (
                        <Badge variant="secondary" className="capitalize">
                          {expense.recurrenceFrequency}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatMoney(expense.amount, currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <div className="space-y-3 sm:hidden">
            {result.data.map((expense) => (
              <Card key={expense._id}>
                <CardContent className="space-y-1.5 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{expense.category}</p>
                    <span className="font-mono text-sm tabular-nums">{formatMoney(expense.amount, currency)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(expense.date), 'MMM d, yyyy')} &middot; {expense.vendor || 'No vendor'}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <PaginationBar
            page={result.pagination.page}
            totalPages={result.pagination.totalPages}
            total={result.pagination.total}
            onPageChange={(p) => updateParams({ page: String(p) })}
          />
        </>
      )}

      <ExpenseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        currency={currency}
        onSaved={() => {
          load();
          loadCharts();
        }}
      />
    </div>
  );
}

function ExpensesSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

function PaginationBar({
  page,
  totalPages,
  total,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        Page {page} of {totalPages} &middot; {total} total
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
