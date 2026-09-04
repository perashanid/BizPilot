'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { AlertTriangle, ChevronLeft, ChevronRight, PackagePlus, Search, Sparkles, Warehouse } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import type { Insight, InsightSeverity, InventoryRecord, Paginated, Product, StockMovement } from '@/lib/types';
import { StockAdjustDialog } from './_components/stock-adjust-dialog';
import { SearchCombobox } from './_components/search-combobox';

interface InventoryRow extends InventoryRecord {
  productName: string;
  sku: string;
  reorderPoint: number;
  available: number;
  status: 'out' | 'low' | 'ok';
}

const STOCK_STATUS_BADGE: Record<InventoryRow['status'], 'success' | 'warning' | 'destructive'> = {
  ok: 'success',
  low: 'warning',
  out: 'destructive',
};

const SEVERITY_BADGE: Record<InsightSeverity, 'destructive' | 'warning' | 'secondary'> = {
  critical: 'destructive',
  warning: 'warning',
  opportunity: 'secondary',
};

export default function InventoryPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const page = Number(searchParams.get('page') || '1') || 1;
  const search = searchParams.get('search') || '';

  const [searchInput, setSearchInput] = useState(search);
  const [result, setResult] = useState<Paginated<InventoryRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [executingInsight, setExecutingInsight] = useState<string | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);

  // Movement history — filterable by product, own pagination (secondary section)
  const [movProduct, setMovProduct] = useState<Product | null>(null);
  const [movPage, setMovPage] = useState(1);
  const [movements, setMovements] = useState<Paginated<StockMovement> | null>(null);
  const [movLoading, setMovLoading] = useState(true);
  const productNameCache = useRef<Map<string, string>>(new Map());
  const [productNames, setProductNames] = useState<Map<string, string>>(new Map());

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

  useEffect(() => {
    const handle = setTimeout(() => {
      if (searchInput !== search) updateParams({ search: searchInput || null, page: '1' });
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const loadInventory = useCallback(() => {
    setLoading(true);
    setError(false);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', '20');
    if (search) params.set('search', search);

    fetch(`/api/inventory?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load inventory');
        return r.json();
      })
      .then(setResult)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [page, search]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  const loadInsights = useCallback(() => {
    setInsightsLoading(true);
    fetch('/api/copilot/insights?status=new')
      .then((r) => r.json())
      .then((data: { data: Insight[] }) => {
        setInsights((data.data ?? []).filter((i) => i.status === 'new' && i.type === 'low_stock'));
      })
      .catch(() => setInsights([]))
      .finally(() => setInsightsLoading(false));
  }, []);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  const loadMovements = useCallback(() => {
    setMovLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(movPage));
    params.set('limit', '20');
    if (movProduct) params.set('productId', movProduct._id);

    fetch(`/api/inventory/movements?${params.toString()}`)
      .then((r) => r.json())
      .then((data: Paginated<StockMovement>) => setMovements(data))
      .catch(() => setMovements(null))
      .finally(() => setMovLoading(false));
  }, [movPage, movProduct]);

  useEffect(() => {
    loadMovements();
  }, [loadMovements]);

  // Resolve product names for the current page of movements (bounded to page size)
  useEffect(() => {
    if (!movements) return;
    const missing = [...new Set(movements.data.map((m) => m.productId))].filter((id) => !productNameCache.current.has(id));
    if (missing.length === 0) return;
    Promise.all(
      missing.map((id) =>
        fetch(`/api/products/${id}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((p) => productNameCache.current.set(id, p?.name ?? 'Unknown product'))
          .catch(() => productNameCache.current.set(id, 'Unknown product'))
      )
    ).then(() => setProductNames(new Map(productNameCache.current)));
  }, [movements]);

  async function handleExecuteInsight(insight: Insight) {
    setExecutingInsight(insight._id);
    try {
      const res = await fetch(`/api/copilot/insights/${insight._id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'execute' }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Could not create PO', description: data?.error?.message, variant: 'destructive' });
        return;
      }
      toast({
        title: 'Purchase order created',
        description: data?.purchaseOrder?.poNumber ? `PO ${data.purchaseOrder.poNumber} created.` : undefined,
        variant: 'success',
      });
      loadInsights();
      loadInventory();
    } catch {
      toast({ title: 'Network error', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setExecutingInsight(null);
    }
  }

  const rows = result?.data ?? [];
  const pagination = result?.pagination;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Inventory</h1>
          <p className="text-sm text-muted-foreground">Stock levels, reorder suggestions, and movement history.</p>
        </div>
        <Button onClick={() => setAdjustOpen(true)}>
          <PackagePlus className="h-4 w-4" />
          Adjust stock
        </Button>
      </div>

      {/* Reorder suggestions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4" /> Reorder suggestions
          </CardTitle>
          <CardDescription>Copilot flags products at or below their reorder point.</CardDescription>
        </CardHeader>
        <CardContent>
          {insightsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : insights.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing needs reordering right now.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {insights.map((insight) => (
                <div key={insight._id} className="rounded-md border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{insight.title}</p>
                    <Badge variant={SEVERITY_BADGE[insight.severity]}>{insight.severity}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{insight.body}</p>
                  {insight.suggestedAction.type === 'create_purchase_order' ? (
                    <Button
                      size="sm"
                      className="mt-2"
                      onClick={() => handleExecuteInsight(insight)}
                      disabled={executingInsight === insight._id}
                    >
                      {executingInsight === insight._id ? 'Creating…' : insight.suggestedAction.label}
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stock levels table */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by product or SKU..."
            className="pl-8"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <Card className="p-4">
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      ) : error ? (
        <ErrorState message="Could not load inventory." onRetry={loadInventory} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Warehouse}
          title={search ? 'No stock records match your search' : 'No inventory yet'}
          description={
            search ? 'Try a different search.' : 'Stock levels will appear here once products have inventory records.'
          }
        />
      ) : (
        <>
          <Card className="hidden overflow-hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">Reserved</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row._id}>
                    <TableCell className="font-medium">{row.productName}</TableCell>
                    <TableCell className="font-mono">{row.sku}</TableCell>
                    <TableCell>{row.location}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{row.quantityOnHand}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{row.quantityReserved}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{row.available}</TableCell>
                    <TableCell>
                      <Badge variant={STOCK_STATUS_BADGE[row.status]}>{row.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <div className="space-y-3 sm:hidden">
            {rows.map((row) => (
              <Card key={row._id} className="p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{row.productName}</span>
                  <Badge variant={STOCK_STATUS_BADGE[row.status]}>{row.status}</Badge>
                </div>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{row.sku}</p>
                <div className="mt-2 flex justify-between text-sm">
                  <span className="text-muted-foreground">Available</span>
                  <span className="font-mono tabular-nums">{row.available}</span>
                </div>
              </Card>
            ))}
          </div>

          {pagination && pagination.totalPages > 1 ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages} &middot; {pagination.total} records
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => updateParams({ page: String(page - 1) })}>
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

      {/* Movement history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Movement history</CardTitle>
          <CardDescription>Every stock change, filterable by product.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-full max-w-xs">
              <SearchCombobox<Product>
                placeholder="Filter by product..."
                fetchUrl={(q) => `/api/products?search=${encodeURIComponent(q)}&limit=10`}
                renderItem={(p) => (
                  <span>
                    {p.name} <span className="text-muted-foreground">({p.sku})</span>
                  </span>
                )}
                getKey={(p) => p._id}
                onSelect={(p) => {
                  setMovProduct(p);
                  setMovPage(1);
                }}
                triggerLabel={movProduct ? `${movProduct.name} (${movProduct.sku})` : 'All products'}
              />
            </div>
            {movProduct ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMovProduct(null);
                  setMovPage(1);
                }}
              >
                Clear filter
              </Button>
            ) : null}
          </div>

          {movLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : !movements || movements.data.length === 0 ? (
            <EmptyState
              icon={AlertTriangle}
              title="No stock movements"
              description={movProduct ? 'No recorded movements for this product yet.' : 'Movements will show up here as stock changes.'}
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Delta</TableHead>
                      <TableHead className="text-right">Qty after</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.data.map((m) => (
                      <TableRow key={m._id}>
                        <TableCell>{productNames.get(m.productId) ?? '…'}</TableCell>
                        <TableCell className="capitalize">{m.type}</TableCell>
                        <TableCell
                          className={`text-right font-mono tabular-nums ${m.quantityDelta < 0 ? 'text-destructive' : 'text-success'}`}
                        >
                          {m.quantityDelta > 0 ? '+' : ''}
                          {m.quantityDelta}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{m.quantityAfter}</TableCell>
                        <TableCell className="font-mono tabular-nums">{format(new Date(m.timestamp), 'MMM d, yyyy')}</TableCell>
                        <TableCell className="text-muted-foreground">{m.reason || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-2 sm:hidden">
                {movements.data.map((m) => (
                  <div key={m._id} className="rounded-md border border-border p-3 text-sm">
                    <div className="flex justify-between font-medium">
                      <span>{productNames.get(m.productId) ?? '…'}</span>
                      <span className={m.quantityDelta < 0 ? 'text-destructive' : 'text-success'}>
                        {m.quantityDelta > 0 ? '+' : ''}
                        {m.quantityDelta}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {m.type} &middot; {format(new Date(m.timestamp), 'MMM d, yyyy')}
                    </p>
                  </div>
                ))}
              </div>

              {movements.pagination.totalPages > 1 ? (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Page {movements.pagination.page} of {movements.pagination.totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={movPage <= 1} onClick={() => setMovPage((p) => p - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                      Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={movPage >= movements.pagination.totalPages}
                      onClick={() => setMovPage((p) => p + 1)}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <StockAdjustDialog
        open={adjustOpen}
        onClose={(adjusted) => {
          setAdjustOpen(false);
          if (adjusted) {
            loadInventory();
            loadMovements();
          }
        }}
      />
    </div>
  );
}
