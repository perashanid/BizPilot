'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeft, Check, PackageCheck, RotateCcw, Ban, FileOutput } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { formatMoney } from '@/lib/money';
import type { Business, Sale, SaleStatus, PaymentStatus, Customer } from '@/lib/types';
import { ConfirmDialog } from '../_components/confirm-dialog';

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

const STEPS: SaleStatus[] = ['draft', 'confirmed', 'fulfilled'];

export default function SaleDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();

  const [sale, setSale] = useState<Sale | null>(null);
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<'cancel' | 'refund' | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    fetch(`/api/sales/${params.id}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load sale');
        return r.json();
      })
      .then((data: Sale) => setSale(data))
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

  useEffect(() => {
    if (!sale?.customerId) {
      setCustomerName(null);
      return;
    }
    fetch(`/api/customers/${sale.customerId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((c: Customer | null) => setCustomerName(c?.name ?? null))
      .catch(() => setCustomerName(null));
  }, [sale?.customerId]);

  async function runAction(action: 'fulfill' | 'cancel' | 'refund' | 'convert-to-invoice', successMsg: string) {
    setActionLoading(action);
    try {
      const res = await fetch(`/api/sales/${params.id}/${action}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: 'Action failed',
          description: data?.error?.message ?? 'Something went wrong.',
          variant: 'destructive',
        });
        return;
      }
      toast({ title: successMsg, variant: 'success' });
      load();
    } catch {
      toast({ title: 'Action failed', description: 'Network error. Please try again.', variant: 'destructive' });
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  }

  if (loading) return <SaleDetailSkeleton />;
  if (error || !sale) return <ErrorState message="Could not load this sale." onRetry={load} />;

  const stepIndex = STEPS.indexOf(sale.status);
  const isTerminalAlt = sale.status === 'cancelled' || sale.status === 'refunded';

  const canFulfill = sale.status === 'confirmed';
  const canCancel = sale.amountPaid === 0 && !['cancelled', 'refunded'].includes(sale.status);
  const canRefund = sale.status === 'confirmed' || sale.status === 'fulfilled';
  const canConvert = Boolean(sale.customerId);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push('/sales')}>
        <ArrowLeft className="h-4 w-4" />
        Back to sales
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">{sale.orderNumber}</h1>
          <p className="text-sm text-muted-foreground">
            {customerName ?? (sale.customerId ? '…' : 'Walk-in')} &middot; {format(new Date(sale.date), 'MMM d, yyyy')}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant={SALE_STATUS_BADGE[sale.status]}>{sale.status}</Badge>
          <Badge variant={PAYMENT_STATUS_BADGE[sale.paymentStatus]}>{sale.paymentStatus}</Badge>
        </div>
      </div>

      {/* Status timeline */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center">
            {STEPS.map((step, i) => (
              <div key={step} className="flex flex-1 items-center last:flex-none">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                      !isTerminalAlt && i <= stepIndex
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {!isTerminalAlt && i < stepIndex ? <Check className="h-4 w-4" /> : i + 1}
                  </div>
                  <span className="text-xs capitalize text-muted-foreground">{step}</span>
                </div>
                {i < STEPS.length - 1 ? (
                  <div className={`mx-2 h-px flex-1 ${!isTerminalAlt && i < stepIndex ? 'bg-primary' : 'bg-border'}`} />
                ) : null}
              </div>
            ))}
            {isTerminalAlt ? (
              <>
                <div className="mx-2 h-px w-6 bg-border" />
                <div className="flex flex-col items-center gap-1">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs font-medium">
                    <Ban className="h-4 w-4" />
                  </div>
                  <span className="text-xs capitalize text-destructive">{sale.status}</span>
                </div>
              </>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Line items */}
      <Card>
        <CardHeader>
          <CardTitle>Line items</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead className="text-right">Tax %</TableHead>
                  <TableHead className="text-right">Line total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sale.lineItems.map((line, i) => (
                  <TableRow key={i}>
                    <TableCell>{line.name}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{line.qty}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatMoney(line.unitPrice, currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatMoney(line.discount, currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{line.taxRate}%</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatMoney(line.lineTotal, currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="space-y-2 sm:hidden">
            {sale.lineItems.map((line, i) => (
              <div key={i} className="rounded-md border border-border p-3 text-sm">
                <div className="flex justify-between font-medium">
                  <span>{line.name}</span>
                  <span className="font-mono tabular-nums">{formatMoney(line.lineTotal, currency)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Qty {line.qty} &middot; {formatMoney(line.unitPrice, currency)} each &middot; Tax {line.taxRate}%
                </p>
              </div>
            ))}
          </div>

          <div className="ml-auto mt-4 w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-mono tabular-nums">{formatMoney(sale.subtotal, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span className="font-mono tabular-nums">{formatMoney(sale.taxTotal, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Discount</span>
              <span className="font-mono tabular-nums">-{formatMoney(sale.discountTotal, currency)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span className="font-mono tabular-nums">{formatMoney(sale.grandTotal, currency)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Paid</span>
              <span className="font-mono tabular-nums">{formatMoney(sale.amountPaid, currency)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {sale.notes ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{sale.notes}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {canFulfill ? (
          <Button onClick={() => runAction('fulfill', 'Sale marked as fulfilled')} disabled={actionLoading !== null}>
            <PackageCheck className="h-4 w-4" />
            Mark fulfilled
          </Button>
        ) : null}
        {canConvert ? (
          <Button
            variant="secondary"
            onClick={() => runAction('convert-to-invoice', 'Invoice created from this sale')}
            disabled={actionLoading !== null}
          >
            <FileOutput className="h-4 w-4" />
            Convert to invoice
          </Button>
        ) : null}
        {canRefund ? (
          <Button variant="outline" onClick={() => setConfirmAction('refund')} disabled={actionLoading !== null}>
            <RotateCcw className="h-4 w-4" />
            Refund
          </Button>
        ) : null}
        {canCancel ? (
          <Button variant="destructive" onClick={() => setConfirmAction('cancel')} disabled={actionLoading !== null}>
            <Ban className="h-4 w-4" />
            Cancel sale
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmAction === 'cancel'}
        onOpenChange={(o) => !o && setConfirmAction(null)}
        title="Cancel this sale?"
        description="This will restore any stock that was deducted for this order. This cannot be undone."
        confirmLabel="Cancel sale"
        loading={actionLoading === 'cancel'}
        onConfirm={() => runAction('cancel', 'Sale cancelled')}
      />
      <ConfirmDialog
        open={confirmAction === 'refund'}
        onOpenChange={(o) => !o && setConfirmAction(null)}
        title="Refund this sale?"
        description="This will restore stock and mark the order as refunded. This cannot be undone."
        confirmLabel="Refund sale"
        loading={actionLoading === 'refund'}
        onConfirm={() => runAction('refund', 'Sale refunded')}
      />
    </div>
  );
}

function SaleDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
