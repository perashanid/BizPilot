'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { Plus, Search, ShoppingCart, ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatMoney } from '@/lib/money';
import type { Business, Customer, Paginated, Sale, SaleStatus, PaymentStatus } from '@/lib/types';
import { NewSaleDialog } from './_components/new-sale-dialog';

const SALE_STATUS_BADGE: Record<SaleStatus, 'success' | 'secondary' | 'warning' | 'destructive' | 'outline'> = {
  draft: 'outline',
  confirmed: 'secondary',
  fulfilled: 'success',
  cancelled: 'destructive',
  refunded: 'warning',
};

const PAYMENT_STATUS_BADGE: Record<PaymentStatus, 'success' | 'secondary' | 'warning' | 'destructive' | 'outline'> = {
  unpaid: 'outline',
  partial: 'warning',
  paid: 'success',
};

export default function SalesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const page = Number(searchParams.get('page') || '1') || 1;
  const search = searchParams.get('search') || '';
  const status = searchParams.get('status') || 'all';
  const sort = searchParams.get('sort') || 'date';
  const order = (searchParams.get('order') as 'asc' | 'desc') || 'desc';

  const [searchInput, setSearchInput] = useState(search);
  const [currency, setCurrency] = useState('USD');
  const [result, setResult] = useState<Paginated<Sale> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [newSaleOpen, setNewSaleOpen] = useState(false);
  const [customerNames, setCustomerNames] = useState<Map<string, string>>(new Map());
  const customerCache = useRef<Map<string, string>>(new Map());
  const openedFromQuery = useRef(false);

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === '') params.delete(key);
        else params.set(key, value);
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  // Debounce search input -> URL param
  useEffect(() => {
    const handle = setTimeout(() => {
      if (searchInput !== search) updateParams({ search: searchInput || null, page: '1' });
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data: { business: Business | null }) => setCurrency(data.business?.currency || 'USD'))
      .catch(() => setCurrency('USD'));
  }, []);

  // Auto-open "New sale" dialog from ?new=1
  useEffect(() => {
    if (searchParams.get('new') === '1' && !openedFromQuery.current) {
      openedFromQuery.current = true;
      setNewSaleOpen(true);
    }
  }, [searchParams]);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', '20');
    params.set('sort', sort);
    params.set('order', order);
    if (search) params.set('search', search);
    if (status !== 'all') params.set('status', status);

    fetch(`/api/sales?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load sales');
        return r.json();
      })
      .then((data: Paginated<Sale>) => setResult(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [page, sort, order, search, status]);

  useEffect(() => {
    load();
  }, [load]);

  // Resolve customer names for the current page of sales (bounded to page size) — one
  // batched request instead of one GET per unique customer.
  useEffect(() => {
    if (!result) return;
    const missing = [...new Set(result.data.map((s) => s.customerId).filter((id): id is string => Boolean(id)))].filter(
      (id) => !customerCache.current.has(id)
    );
    if (missing.length === 0) return;
    fetch(`/api/customers?ids=${missing.map(encodeURIComponent).join(',')}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Paginated<Customer> | null) => {
        const found = new Map((data?.data ?? []).map((c) => [c._id, c.name]));
        for (const id of missing) customerCache.current.set(id, found.get(id) ?? 'Customer');
        setCustomerNames(new Map(customerCache.current));
      })
      .catch(() => {
        for (const id of missing) customerCache.current.set(id, 'Customer');
        setCustomerNames(new Map(customerCache.current));
      });
  }, [result]);

  const closeNewSale = (created: boolean) => {
    setNewSaleOpen(false);
    if (searchParams.get('new') === '1') updateParams({ new: null });
    if (created) load();
  };

  const rows = result?.data ?? [];
  const pagination = result?.pagination;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Sales</h1>
          <p className="text-sm text-muted-foreground">Orders placed across every channel.</p>
        </div>
        <Button onClick={() => setNewSaleOpen(true)}>
          <Plus className="h-4 w-4" />
          New sale
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search order number..."
            className="pl-8"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={(v) => updateParams({ status: v === 'all' ? null : v, page: '1' })}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="fulfilled">Fulfilled</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={`${sort}:${order}`}
          onValueChange={(v) => {
            const [s, o] = v.split(':');
            updateParams({ sort: s, order: o, page: '1' });
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date:desc">Newest first</SelectItem>
            <SelectItem value="date:asc">Oldest first</SelectItem>
            <SelectItem value="grandTotal:desc">Total: high to low</SelectItem>
            <SelectItem value="grandTotal:asc">Total: low to high</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <SalesTableSkeleton />
      ) : error ? (
        <ErrorState message="Could not load sales." onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title={search || status !== 'all' ? 'No sales match your filters' : 'No sales yet'}
          description={
            search || status !== 'all'
              ? 'Try a different search or clear the filters.'
              : 'Once you record a sale, it will show up here.'
          }
          action={
            !search && status === 'all' ? (
              <Button onClick={() => setNewSaleOpen(true)}>
                <Plus className="h-4 w-4" />
                Create your first sale
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden overflow-hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((sale) => (
                  <TableRow key={sale._id} className="cursor-pointer">
                    <TableCell>
                      <Link href={`/sales/${sale._id}`} className="font-medium hover:underline">
                        {sale.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{sale.customerId ? customerNames.get(sale.customerId) ?? '…' : 'Walk-in'}</TableCell>
                    <TableCell className="font-mono tabular-nums">{format(new Date(sale.date), 'MMM d, yyyy')}</TableCell>
                    <TableCell>
                      <Badge variant={SALE_STATUS_BADGE[sale.status]}>{sale.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={PAYMENT_STATUS_BADGE[sale.paymentStatus]}>{sale.paymentStatus}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatMoney(sale.grandTotal, currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Mobile stacked cards */}
          <div className="space-y-3 sm:hidden">
            {rows.map((sale) => (
              <Link key={sale._id} href={`/sales/${sale._id}`}>
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{sale.orderNumber}</span>
                    <span className="font-mono tabular-nums">{formatMoney(sale.grandTotal, currency)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-sm text-muted-foreground">
                    <span>{sale.customerId ? customerNames.get(sale.customerId) ?? '…' : 'Walk-in'}</span>
                    <span className="font-mono tabular-nums">{format(new Date(sale.date), 'MMM d, yyyy')}</span>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Badge variant={SALE_STATUS_BADGE[sale.status]}>{sale.status}</Badge>
                    <Badge variant={PAYMENT_STATUS_BADGE[sale.paymentStatus]}>{sale.paymentStatus}</Badge>
                  </div>
                </Card>
              </Link>
            ))}
          </div>

          {pagination && pagination.totalPages > 1 ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages} &middot; {pagination.total} sales
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => updateParams({ page: String(page - 1) })}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.totalPages}
                  onClick={() => updateParams({ page: String(page + 1) })}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}

      <NewSaleDialog open={newSaleOpen} onClose={closeNewSale} currency={currency} />
    </div>
  );
}

function SalesTableSkeleton() {
  return (
    <Card className="p-4">
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </Card>
  );
}
