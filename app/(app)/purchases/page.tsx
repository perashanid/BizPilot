'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { Plus, Search, Truck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { formatMoney } from '@/lib/money';
import type { Business, Paginated, PoStatus, PurchaseOrder, Supplier } from '@/lib/types';
import { NewPoDialog } from './_components/po-dialog';

function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);
  return debounced;
}

function poStatusVariant(status: PoStatus): 'success' | 'secondary' | 'warning' | 'destructive' | 'outline' {
  switch (status) {
    case 'received':
      return 'success';
    case 'sent':
      return 'secondary';
    case 'partially_received':
      return 'warning';
    case 'cancelled':
      return 'destructive';
    default:
      return 'outline';
  }
}

export default function PurchasesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '');
  const debouncedSearch = useDebouncedValue(searchInput);
  const status = searchParams.get('status') ?? 'all';
  const supplierId = searchParams.get('supplierId') ?? 'all';
  const page = Number(searchParams.get('page') ?? '1');

  const [result, setResult] = useState<Paginated<PurchaseOrder> | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
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
    (async () => {
      const [supRes, meRes] = await Promise.all([fetch('/api/suppliers?limit=100'), fetch('/api/auth/me')]);
      const supData = await supRes.json();
      const meData = await meRes.json();
      if (supRes.ok) setSuppliers((supData as Paginated<Supplier>).data);
      setBusiness(meData?.business ?? null);
    })();
  }, []);

  const supplierMap = new Map(suppliers.map((s) => [s._id, s.name]));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page || 1));
      params.set('limit', '20');
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (status !== 'all') params.set('status', status);
      if (supplierId !== 'all') params.set('supplierId', supplierId);
      const res = await fetch(`/api/purchase-orders?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Could not load purchase orders.');
      setResult(data as Paginated<PurchaseOrder>);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load purchase orders.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, status, supplierId]);

  useEffect(() => {
    load();
  }, [load]);

  const currency = business?.currency ?? 'USD';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Purchases</h1>
          <p className="text-sm text-muted-foreground">Order and track stock coming in from suppliers.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New PO
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search PO number..."
            className="pl-8"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={(v) => updateParams({ status: v === 'all' ? undefined : v, page: undefined })}>
          <SelectTrigger className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="partially_received">Partially received</SelectItem>
            <SelectItem value="received">Received</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={supplierId} onValueChange={(v) => updateParams({ supplierId: v === 'all' ? undefined : v, page: undefined })}>
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="All suppliers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All suppliers</SelectItem>
            {suppliers.map((s) => (
              <SelectItem key={s._id} value={s._id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <PurchasesSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !result || result.data.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No purchase orders yet"
          description="Create a purchase order to start restocking from a supplier."
          action={
            <Button onClick={() => setDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              New PO
            </Button>
          }
        />
      ) : (
        <>
          <Card className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expected date</TableHead>
                  <TableHead className="text-right tabular-nums">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.data.map((po) => (
                  <TableRow key={po._id}>
                    <TableCell className="font-medium">
                      <Link href={`/purchases/${po._id}`} className="hover:underline">
                        {po.poNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{supplierMap.get(po.supplierId) ?? 'Unknown supplier'}</TableCell>
                    <TableCell>
                      <Badge variant={poStatusVariant(po.status)}>{po.status.replace('_', ' ')}</Badge>
                    </TableCell>
                    <TableCell>{po.expectedDate ? format(new Date(po.expectedDate), 'MMM d, yyyy') : '—'}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatMoney(po.total, currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <div className="space-y-3 sm:hidden">
            {result.data.map((po) => (
              <Link key={po._id} href={`/purchases/${po._id}`}>
                <Card>
                  <CardContent className="space-y-1.5 p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{po.poNumber}</p>
                      <Badge variant={poStatusVariant(po.status)}>{po.status.replace('_', ' ')}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{supplierMap.get(po.supplierId) ?? 'Unknown supplier'}</p>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {po.expectedDate ? format(new Date(po.expectedDate), 'MMM d, yyyy') : 'No expected date'}
                      </span>
                      <span className="font-mono tabular-nums">{formatMoney(po.total, currency)}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
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

      <NewPoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        currency={currency}
        onCreated={() => load()}
      />
    </div>
  );
}

function PurchasesSkeleton() {
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
