'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeft, Send, Ban, PackageCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
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
import type { Business, PoStatus, PurchaseOrder, Supplier } from '@/lib/types';
import { ReceivePoDialog } from '../_components/receive-dialog';

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

export default function PurchaseOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();

  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [receiveOpen, setReceiveOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [poRes, meRes] = await Promise.all([fetch(`/api/purchase-orders/${params.id}`), fetch('/api/auth/me')]);
      const poData = await poRes.json();
      if (!poRes.ok) throw new Error(poData?.error?.message ?? 'Could not load purchase order.');
      const meData = await meRes.json();
      setPo(poData as PurchaseOrder);
      setBusiness(meData?.business ?? null);

      const supRes = await fetch(`/api/suppliers/${(poData as PurchaseOrder).supplierId}`);
      if (supRes.ok) setSupplier(await supRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load purchase order.');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSend() {
    if (!po) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/purchase-orders/${po._id}/send`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Could not send purchase order.');
      setPo(data as PurchaseOrder);
      toast({ title: 'Purchase order sent', variant: 'success' });
    } catch (err) {
      toast({ title: 'Could not send', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancel() {
    if (!po) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/purchase-orders/${po._id}/cancel`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Could not cancel purchase order.');
      setPo(data as PurchaseOrder);
      toast({ title: 'Purchase order cancelled', variant: 'success' });
      setCancelOpen(false);
    } catch (err) {
      toast({ title: 'Could not cancel', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  }

  const currency = business?.currency ?? 'USD';

  if (loading) return <DetailSkeleton />;
  if (error || !po) return <ErrorState message={error ?? 'Purchase order not found.'} onRetry={load} />;

  const canSend = po.status === 'draft';
  const canCancel = po.status === 'draft' || po.status === 'sent';
  const canReceive = po.status === 'sent' || po.status === 'partially_received';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/purchases" className="mb-2 flex items-center gap-1 text-sm text-muted-foreground hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" />
            Purchases
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold">{po.poNumber}</h1>
            <Badge variant={poStatusVariant(po.status)}>{po.status.replace('_', ' ')}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canSend ? (
            <Button size="sm" className="gap-2" onClick={handleSend} disabled={actionLoading}>
              <Send className="h-4 w-4" />
              Send
            </Button>
          ) : null}
          {canReceive ? (
            <Button size="sm" variant="secondary" className="gap-2" onClick={() => setReceiveOpen(true)}>
              <PackageCheck className="h-4 w-4" />
              Receive stock
            </Button>
          ) : null}
          {canCancel ? (
            <Button size="sm" variant="destructive" className="gap-2" onClick={() => setCancelOpen(true)} disabled={actionLoading}>
              <Ban className="h-4 w-4" />
              Cancel
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Line items</CardTitle>
            <CardDescription>Quantity ordered vs. received per line</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right tabular-nums">Ordered</TableHead>
                    <TableHead className="text-right tabular-nums">Received</TableHead>
                    <TableHead className="text-right tabular-nums">Unit cost</TableHead>
                    <TableHead className="text-right tabular-nums">Line total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {po.lineItems.map((line, i) => (
                    <TableRow key={`${line.productId}-${i}`}>
                      <TableCell>
                        <p className="font-medium">{line.name}</p>
                        {line.sku ? <p className="text-xs text-muted-foreground">{line.sku}</p> : null}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{line.qtyOrdered}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        <span className={line.qtyReceived >= line.qtyOrdered ? 'text-success' : ''}>{line.qtyReceived}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{formatMoney(line.unitCost, currency)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatMoney(line.qtyOrdered * line.unitCost, currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="space-y-3 sm:hidden">
              {po.lineItems.map((line, i) => (
                <div key={`${line.productId}-${i}`} className="rounded-md border border-border p-3">
                  <p className="font-medium">{line.name}</p>
                  {line.sku ? <p className="text-xs text-muted-foreground">{line.sku}</p> : null}
                  <div className="mt-2 grid grid-cols-2 gap-1 text-sm">
                    <span className="text-muted-foreground">Ordered</span>
                    <span className="text-right font-mono tabular-nums">{line.qtyOrdered}</span>
                    <span className="text-muted-foreground">Received</span>
                    <span className="text-right font-mono tabular-nums">{line.qtyReceived}</span>
                    <span className="text-muted-foreground">Unit cost</span>
                    <span className="text-right font-mono tabular-nums">{formatMoney(line.unitCost, currency)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-1 border-t border-border pt-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono tabular-nums">{formatMoney(po.subtotal, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span className="font-mono tabular-nums">{formatMoney(po.shipping, currency)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span className="font-mono tabular-nums">{formatMoney(po.total, currency)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Amount paid</span>
                <span className="font-mono tabular-nums">{formatMoney(po.amountPaid, currency)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Supplier</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              {supplier ? (
                <>
                  <Link href={`/suppliers/${supplier._id}`} className="font-medium hover:underline">
                    {supplier.name}
                  </Link>
                  <p className="text-muted-foreground">{supplier.email || '—'}</p>
                  <p className="text-muted-foreground">{supplier.phone || '—'}</p>
                </>
              ) : (
                <p className="text-muted-foreground">Unknown supplier</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expected date</span>
                <span>{po.expectedDate ? format(new Date(po.expectedDate), 'MMM d, yyyy') : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Received date</span>
                <span>{po.receivedDate ? format(new Date(po.receivedDate), 'MMM d, yyyy') : '—'}</span>
              </div>
              {po.notes ? (
                <div className="pt-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Notes</p>
                  <p className="mt-1 whitespace-pre-wrap">{po.notes}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      {canReceive ? (
        <ReceivePoDialog
          open={receiveOpen}
          onOpenChange={setReceiveOpen}
          po={po}
          onReceived={(updated) => setPo(updated)}
        />
      ) : null}

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel purchase order?</DialogTitle>
            <DialogDescription>
              {po.poNumber} will be marked cancelled. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>
              Keep order
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={actionLoading}>
              {actionLoading ? 'Cancelling...' : 'Cancel order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-96 lg:col-span-2" />
        <div className="space-y-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    </div>
  );
}
