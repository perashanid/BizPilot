'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Plus, Search, Package, ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatMoney, marginPercent } from '@/lib/money';
import type { Business, Paginated, Product } from '@/lib/types';
import { ProductFormDialog } from './_components/product-form-dialog';

function marginBadgeVariant(margin: number): 'success' | 'warning' | 'destructive' {
  if (margin >= 30) return 'success';
  if (margin >= 10) return 'warning';
  return 'destructive';
}

export default function ProductsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const page = Number(searchParams.get('page') || '1') || 1;
  const search = searchParams.get('search') || '';
  const status = searchParams.get('status') || 'active';
  const category = searchParams.get('category') || 'all';

  const [searchInput, setSearchInput] = useState(search);
  const [currency, setCurrency] = useState('USD');
  const [result, setResult] = useState<Paginated<Product> | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data: { business: Business | null }) => setCurrency(data.business?.currency || 'USD'))
      .catch(() => setCurrency('USD'));
  }, []);

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

  useEffect(() => {
    if (searchParams.get('new') === '1') setFormOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', '24');
    if (search) params.set('search', search);
    if (status !== 'all') params.set('status', status);
    if (category !== 'all') params.set('category', category);

    fetch(`/api/products?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load products');
        return r.json();
      })
      .then((data: Paginated<Product>) => {
        setResult(data);
        setCategories((prev) => {
          const found = new Set(prev);
          data.data.forEach((p) => p.category && found.add(p.category));
          return [...found].sort();
        });
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [page, search, status, category]);

  useEffect(() => {
    load();
  }, [load]);

  function closeForm(saved: boolean) {
    setFormOpen(false);
    if (searchParams.get('new') === '1') updateParams({ new: null });
    if (saved) load();
  }

  const rows = result?.data ?? [];
  const pagination = result?.pagination;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Products</h1>
          <p className="text-sm text-muted-foreground">Your catalog, pricing, and margins.</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" />
          Add product
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            className="pl-8"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <Select value={category} onValueChange={(v) => updateParams({ category: v === 'all' ? null : v, page: '1' })}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Category" />
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
        <Select value={status} onValueChange={(v) => updateParams({ status: v === 'all' ? null : v, page: '1' })}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message="Could not load products." onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Package}
          title={search || status !== 'active' || category !== 'all' ? 'No products match your filters' : 'No products yet'}
          description={
            search || status !== 'active' || category !== 'all'
              ? 'Try a different search or clear the filters.'
              : 'Add your first product to start selling and tracking stock.'
          }
          action={
            !search && status === 'active' && category === 'all' ? (
              <Button onClick={() => setFormOpen(true)}>
                <Plus className="h-4 w-4" />
                Add your first product
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((product) => {
            const margin = marginPercent(product.salePrice, product.costPrice);
            return (
              <Link key={product._id} href={`/products/${product._id}`}>
                <Card className="h-full p-4 transition-colors hover:bg-accent/40">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{product.name}</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">{product.sku}</p>
                    </div>
                    {product.status === 'archived' ? <Badge variant="outline">Archived</Badge> : null}
                  </div>
                  {product.category ? <p className="mt-1 text-xs text-muted-foreground">{product.category}</p> : null}
                  <div className="mt-3 flex items-center justify-between">
                    <span className="font-mono text-lg font-semibold tabular-nums">
                      {formatMoney(product.salePrice, currency)}
                    </span>
                    <Badge variant={marginBadgeVariant(margin)}>{margin}% margin</Badge>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {pagination && pagination.totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages} &middot; {pagination.total} products
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

      <ProductFormDialog open={formOpen} onClose={closeForm} currency={currency} />
    </div>
  );
}
