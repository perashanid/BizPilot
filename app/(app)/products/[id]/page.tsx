'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Pencil, Archive, Truck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { formatMoney, marginPercent } from '@/lib/money';
import type { Business, ProductWithStock, Supplier } from '@/lib/types';
import { ProductFormDialog } from '../_components/product-form-dialog';
import { SalesHistoryCharts } from '../_components/sales-history-charts';

function marginBadgeVariant(margin: number): 'success' | 'warning' | 'destructive' {
  if (margin >= 30) return 'success';
  if (margin >= 10) return 'warning';
  return 'destructive';
}

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();

  const [product, setProduct] = useState<ProductWithStock | null>(null);
  const [currency, setCurrency] = useState('USD');
  const [salesHistory, setSalesHistory] = useState<{ month: string; unitsSold: number; revenue: number }[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    Promise.all([
      fetch(`/api/products/${params.id}`).then((r) => {
        if (!r.ok) throw new Error('Failed to load product');
        return r.json();
      }),
      fetch(`/api/products/${params.id}/sales-history`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/suppliers?limit=100`).then((r) => (r.ok ? r.json() : { data: [] })),
    ])
      .then(([productData, history, supplierResult]) => {
        setProduct(productData);
        setSalesHistory(history);
        setSuppliers(
          (supplierResult.data ?? []).filter((s: Supplier) => (s.productIds ?? []).includes(params.id as string))
        );
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data: { business: Business | null }) => setCurrency(data.business?.currency || 'USD'))
      .catch(() => setCurrency('USD'));
  }, []);

  async function handleArchive() {
    setArchiving(true);
    try {
      const res = await fetch(`/api/products/${params.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Could not archive', description: data?.error?.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Product archived', variant: 'success' });
      setArchiveOpen(false);
      load();
    } catch {
      toast({ title: 'Network error', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setArchiving(false);
    }
  }

  if (loading) return <ProductDetailSkeleton />;
  if (error || !product) return <ErrorState message="Could not load this product." onRetry={load} />;

  const margin = marginPercent(product.salePrice, product.costPrice);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push('/products')}>
        <ArrowLeft className="h-4 w-4" />
        Back to products
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold">{product.name}</h1>
            {product.status === 'archived' ? <Badge variant="outline">Archived</Badge> : null}
          </div>
          <p className="font-mono text-sm text-muted-foreground">
            {product.sku} {product.category ? `· ${product.category}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          {product.status === 'active' ? (
            <Button variant="destructive" size="sm" onClick={() => setArchiveOpen(true)}>
              <Archive className="h-4 w-4" />
              Archive
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cost price</CardDescription>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-xl font-semibold tabular-nums">{formatMoney(product.costPrice, currency)}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sale price</CardDescription>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-xl font-semibold tabular-nums">{formatMoney(product.salePrice, currency)}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Margin</CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant={marginBadgeVariant(margin)} className="text-sm">
              {margin}%
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Available stock</CardDescription>
          </CardHeader>
          <CardContent>
            <span
              className={`font-mono text-xl font-semibold tabular-nums ${
                product.available <= product.reorderPoint ? 'text-warning' : ''
              }`}
            >
              {product.available}
            </span>
          </CardContent>
        </Card>
      </div>

      {product.variants.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Variants</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {product.variants.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>{v.name}</TableCell>
                    <TableCell className="font-mono">{v.sku}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatMoney(v.price, currency)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{v.stock}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Sales history</CardTitle>
        </CardHeader>
        <CardContent>
          {salesHistory.length === 0 ? (
            <EmptyState title="No sales history yet" description="Once this product sells, monthly trends show up here." />
          ) : (
            <SalesHistoryCharts data={salesHistory} currency={currency} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Truck className="h-4 w-4" /> Linked suppliers
          </CardTitle>
        </CardHeader>
        <CardContent>
          {suppliers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No suppliers linked to this product yet.</p>
          ) : (
            <ul className="space-y-2">
              {suppliers.map((s) => (
                <li key={s._id} className="flex items-center justify-between text-sm">
                  <span>{s.name}</span>
                  <span className="text-muted-foreground">{s.leadTimeDays}-day lead time</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ProductFormDialog
        open={editOpen}
        onClose={(saved) => {
          setEditOpen(false);
          if (saved) load();
        }}
        currency={currency}
        product={product}
      />

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive this product?</DialogTitle>
            <DialogDescription>
              {product.name} will no longer appear in active product pickers. Its sales history is kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setArchiveOpen(false)} disabled={archiving}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleArchive} disabled={archiving}>
              {archiving ? 'Archiving…' : 'Archive'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProductDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-16 w-full" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
