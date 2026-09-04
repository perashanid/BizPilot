'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { Plus, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { formatMoney } from '@/lib/money';
import type { AgingBucket } from '@/lib/financials';
import type { Business, Invoice, Paginated, Payment, PurchaseOrder } from '@/lib/types';
import { AgingSummary } from './_components/aging-summary';
import { RecordPaymentDialog } from './_components/record-payment-dialog';

export default function PaymentsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const direction = searchParams.get('direction') === 'out' ? 'out' : 'in';
  const page = Number(searchParams.get('page') ?? '1');

  const [result, setResult] = useState<Paginated<Payment> | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [business, setBusiness] = useState<Business | null>(null);
  const [receivableAging, setReceivableAging] = useState<{ summary: AgingBucket } | null>(null);
  const [payableAging, setPayableAging] = useState<{ summary: AgingBucket } | null>(null);
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
    (async () => {
      const [meRes, recvRes, payRes, invRes, poRes] = await Promise.all([
        fetch('/api/auth/me'),
        fetch('/api/analytics/aging?type=receivable'),
        fetch('/api/analytics/aging?type=payable'),
        fetch('/api/invoices?limit=100'),
        fetch('/api/purchase-orders?limit=100'),
      ]);
      const meData = await meRes.json();
      setBusiness(meData?.business ?? null);
      if (recvRes.ok) setReceivableAging(await recvRes.json());
      if (payRes.ok) setPayableAging(await payRes.json());
      const invData = await invRes.json();
      const poData = await poRes.json();
      if (invRes.ok) setInvoices((invData as Paginated<Invoice>).data);
      if (poRes.ok) setPurchaseOrders((poData as Paginated<PurchaseOrder>).data);
    })();
  }, []);

  const invoiceMap = new Map(invoices.map((i) => [i._id, i.invoiceNumber]));
  const poMap = new Map(purchaseOrders.map((p) => [p._id, p.poNumber]));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page || 1));
      params.set('limit', '20');
      params.set('direction', direction);
      const res = await fetch(`/api/payments?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Could not load payments.');
      setResult(data as Paginated<Payment>);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load payments.');
    } finally {
      setLoading(false);
    }
  }, [page, direction]);

  useEffect(() => {
    load();
  }, [load]);

  function referenceLabel(payment: Payment): string {
    if (payment.invoiceId) return invoiceMap.get(payment.invoiceId) ?? `Invoice ${payment.invoiceId.slice(-6)}`;
    if (payment.purchaseOrderId) return poMap.get(payment.purchaseOrderId) ?? `PO ${payment.purchaseOrderId.slice(-6)}`;
    return 'Standalone';
  }

  const currency = business?.currency ?? 'USD';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Payments</h1>
          <p className="text-sm text-muted-foreground">Money received from customers and paid to suppliers.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Record payment
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AgingSummary
          title="Receivables aging"
          description="Open invoices by age"
          summary={receivableAging?.summary ?? null}
          currency={currency}
        />
        <AgingSummary
          title="Payables aging"
          description="Open purchase orders by age"
          summary={payableAging?.summary ?? null}
          currency={currency}
        />
      </div>

      <Tabs value={direction} onValueChange={(v) => updateParams({ direction: v, page: undefined })}>
        <TabsList>
          <TabsTrigger value="in">Received</TabsTrigger>
          <TabsTrigger value="out">Made</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <PaymentsSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !result || result.data.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={direction === 'in' ? 'No payments received yet' : 'No payments made yet'}
          description="Record a payment to start tracking cash movement."
          action={
            <Button onClick={() => setDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Record payment
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
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Linked to</TableHead>
                  <TableHead className="text-right tabular-nums">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.data.map((payment) => (
                  <TableRow key={payment._id}>
                    <TableCell>{format(new Date(payment.date), 'MMM d, yyyy')}</TableCell>
                    <TableCell className="capitalize">{payment.method}</TableCell>
                    <TableCell>{payment.reference || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{referenceLabel(payment)}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatMoney(payment.amount, currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <div className="space-y-3 sm:hidden">
            {result.data.map((payment) => (
              <Card key={payment._id}>
                <CardContent className="space-y-1.5 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize">{payment.method}</span>
                    <span className="font-mono text-sm tabular-nums">{formatMoney(payment.amount, currency)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(payment.date), 'MMM d, yyyy')} &middot; {referenceLabel(payment)}
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

      <RecordPaymentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        currency={currency}
        onRecorded={() => load()}
      />
    </div>
  );
}

function PaymentsSkeleton() {
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
