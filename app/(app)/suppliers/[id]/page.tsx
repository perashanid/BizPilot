'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeft, Pencil, Ban, Package, Truck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { formatMoney } from '@/lib/money';
import type { Business, Paginated, PoStatus, PurchaseOrder, SupplierWithStats } from '@/lib/types';
import { SupplierDialog } from '../_components/supplier-dialog';

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

export default function SupplierDetailPage() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();

  const [supplier, setSupplier] = useState<SupplierWithStats | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [supplierRes, meRes, poRes] = await Promise.all([
        fetch(`/api/suppliers/${params.id}`),
        fetch('/api/auth/me'),
        fetch(`/api/suppliers/${params.id}/purchase-orders?limit=20&sort=createdAt&order=desc`),
      ]);
      const supplierData = await supplierRes.json();
      if (!supplierRes.ok) throw new Error(supplierData?.error?.message ?? 'Could not load supplier.');
      const meData = await meRes.json();
      const poData = await poRes.json();
      if (!poRes.ok) throw new Error(poData?.error?.message ?? 'Could not load purchase history.');

      setSupplier(supplierData as SupplierWithStats);
      setBusiness(meData?.business ?? null);
      setPurchaseOrders((poData as Paginated<PurchaseOrder>).data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load supplier.');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDeactivate() {
    setDeactivating(true);
    try {
      const res = await fetch(`/api/suppliers/${params.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Could not deactivate supplier.');
      toast({ title: 'Supplier deactivated', variant: 'success' });
      setDeactivateOpen(false);
      load();
    } catch (err) {
      toast({
        title: 'Could not deactivate supplier',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setDeactivating(false);
    }
  }

  const currency = business?.currency ?? 'USD';

  if (loading) return <DetailSkeleton />;
  if (error || !supplier) return <ErrorState message={error ?? 'Supplier not found.'} onRetry={load} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/suppliers" className="mb-2 flex items-center gap-1 text-sm text-muted-foreground hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" />
            Suppliers
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold">{supplier.name}</h1>
            <Badge variant={supplier.status === 'active' ? 'success' : 'outline'}>{supplier.status}</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          {supplier.status === 'active' ? (
            <Button variant="destructive" size="sm" className="gap-2" onClick={() => setDeactivateOpen(true)}>
              <Ban className="h-4 w-4" />
              Deactivate
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Outstanding payable</CardDescription>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-2xl font-semibold tabular-nums">
              {formatMoney(supplier.outstandingPayable, currency)}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>On-time delivery rate</CardDescription>
          </CardHeader>
          <CardContent>
            {supplier.onTimeDeliveryRate === null ? (
              <span className="text-sm text-muted-foreground">Not enough data yet</span>
            ) : (
              <span className="font-mono text-2xl font-semibold tabular-nums">{supplier.onTimeDeliveryRate}%</span>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Payment terms</CardDescription>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-2xl font-semibold tabular-nums">{supplier.paymentTermsDays}d</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Lead time</CardDescription>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-2xl font-semibold tabular-nums">{supplier.leadTimeDays}d</span>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Contact information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow label="Contact person" value={supplier.contactPerson} />
            <InfoRow label="Email" value={supplier.email} />
            <InfoRow label="Phone" value={supplier.phone} />
            <InfoRow label="Address" value={supplier.address} />
            {supplier.notes ? (
              <div className="pt-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Notes</p>
                <p className="mt-1 whitespace-pre-wrap">{supplier.notes}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Products supplied</CardTitle>
          </CardHeader>
          <CardContent>
            {supplier.productIds.length === 0 ? (
              <EmptyState icon={Package} title="No products linked" description="Link products to this supplier from the product form." />
            ) : (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {supplier.productIds.length} product{supplier.productIds.length === 1 ? '' : 's'} supplied
                </span>
                <Link href="/products" className="font-medium text-primary hover:underline">
                  View products
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Purchase history</CardTitle>
          <CardDescription>Recent purchase orders placed with this supplier</CardDescription>
        </CardHeader>
        <CardContent>
          {!purchaseOrders || purchaseOrders.length === 0 ? (
            <EmptyState icon={Truck} title="No purchase orders yet" description="Orders placed with this supplier will show up here." />
          ) : (
            <>
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO Number</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Expected date</TableHead>
                      <TableHead className="text-right tabular-nums">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchaseOrders.map((po) => (
                      <TableRow key={po._id}>
                        <TableCell className="font-medium">
                          <Link href={`/purchases/${po._id}`} className="hover:underline">
                            {po.poNumber}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant={poStatusVariant(po.status)}>{po.status.replace('_', ' ')}</Badge>
                        </TableCell>
                        <TableCell>{po.expectedDate ? format(new Date(po.expectedDate), 'MMM d, yyyy') : '—'}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{formatMoney(po.total, currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-3 sm:hidden">
                {purchaseOrders.map((po) => (
                  <Link key={po._id} href={`/purchases/${po._id}`}>
                    <Card>
                      <CardContent className="space-y-1.5 p-4">
                        <div className="flex items-center justify-between">
                          <p className="font-medium">{po.poNumber}</p>
                          <Badge variant={poStatusVariant(po.status)}>{po.status.replace('_', ' ')}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {po.expectedDate ? format(new Date(po.expectedDate), 'MMM d, yyyy') : 'No expected date'}
                        </p>
                        <p className="font-mono text-sm tabular-nums">{formatMoney(po.total, currency)}</p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <SupplierDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        supplier={supplier}
        onSaved={() => {
          load();
        }}
      />

      <Dialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate supplier?</DialogTitle>
            <DialogDescription>
              {supplier.name} will be marked inactive. Its purchase history is preserved and it can be reactivated later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeactivateOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeactivate} disabled={deactivating}>
              {deactivating ? 'Deactivating...' : 'Deactivate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value || '—'}</span>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-48" />
      <Skeleton className="h-64" />
    </div>
  );
}
