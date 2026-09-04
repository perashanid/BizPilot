'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeft, Download, Send, Ban, DollarSign } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import type { Business, Customer, Invoice, InvoiceStatus } from '@/lib/types';
import { RecordPaymentDialog } from '../_components/record-payment-dialog';

function statusVariant(status: InvoiceStatus): 'success' | 'secondary' | 'warning' | 'destructive' | 'outline' {
  switch (status) {
    case 'paid':
      return 'success';
    case 'sent':
      return 'secondary';
    case 'partially_paid':
      return 'warning';
    case 'overdue':
      return 'destructive';
    case 'void':
      return 'destructive';
    default:
      return 'outline';
  }
}

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [invRes, meRes] = await Promise.all([fetch(`/api/invoices/${params.id}`), fetch('/api/auth/me')]);
      const invData = await invRes.json();
      if (!invRes.ok) throw new Error(invData?.error?.message ?? 'Could not load invoice.');
      const meData = await meRes.json();
      setInvoice(invData as Invoice);
      setBusiness(meData?.business ?? null);

      const custRes = await fetch(`/api/customers/${(invData as Invoice).customerId}`);
      if (custRes.ok) setCustomer(await custRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load invoice.');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSend() {
    if (!invoice) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/invoices/${invoice._id}/send`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Could not send invoice.');
      setInvoice(data as Invoice);
      toast({ title: 'Invoice sent', variant: 'success' });
    } catch (err) {
      toast({ title: 'Could not send invoice', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleVoid() {
    if (!invoice) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/invoices/${invoice._id}/void`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Could not void invoice.');
      setInvoice(data as Invoice);
      toast({ title: 'Invoice voided', variant: 'success' });
      setVoidOpen(false);
    } catch (err) {
      toast({ title: 'Could not void invoice', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  }

  const currency = business?.currency ?? 'USD';

  if (loading) return <DetailSkeleton />;
  if (error || !invoice) return <ErrorState message={error ?? 'Invoice not found.'} onRetry={load} />;

  const canSend = invoice.status === 'draft';
  const canVoid = invoice.status !== 'void' && invoice.amountPaid === 0;
  const canRecordPayment = invoice.status !== 'void' && invoice.status !== 'paid';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/invoices" className="mb-2 flex items-center gap-1 text-sm text-muted-foreground hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" />
            Invoices
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold">{invoice.invoiceNumber}</h1>
            <Badge variant={statusVariant(invoice.status)}>{invoice.status.replace('_', ' ')}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <a href={`/api/invoices/${invoice._id}/pdf`} download={`${invoice.invoiceNumber}.pdf`}>
              <Download className="h-4 w-4" />
              Download PDF
            </a>
          </Button>
          {canSend ? (
            <Button size="sm" className="gap-2" onClick={handleSend} disabled={actionLoading}>
              <Send className="h-4 w-4" />
              Send
            </Button>
          ) : null}
          {canRecordPayment ? (
            <Button size="sm" variant="secondary" className="gap-2" onClick={() => setPaymentOpen(true)}>
              <DollarSign className="h-4 w-4" />
              Record payment
            </Button>
          ) : null}
          {canVoid ? (
            <Button size="sm" variant="destructive" className="gap-2" onClick={() => setVoidOpen(true)} disabled={actionLoading}>
              <Ban className="h-4 w-4" />
              Void
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardContent className="space-y-6 p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row">
            <div>
              <p className="font-display text-xl font-semibold">{business?.name ?? 'Business'}</p>
              {business?.address ? <p className="whitespace-pre-wrap text-sm text-muted-foreground">{business.address}</p> : null}
            </div>
            <div className="text-left sm:text-right">
              <p className="text-sm text-muted-foreground">Invoice</p>
              <p className="font-mono text-lg font-semibold">{invoice.invoiceNumber}</p>
              <p className="text-sm text-muted-foreground">Issued {format(new Date(invoice.issueDate), 'MMM d, yyyy')}</p>
              <p className="text-sm text-muted-foreground">Due {format(new Date(invoice.dueDate), 'MMM d, yyyy')}</p>
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Bill to</p>
            {customer ? (
              <div className="mt-1 text-sm">
                <Link href={`/customers/${customer._id}`} className="font-medium hover:underline">
                  {customer.name}
                </Link>
                {customer.businessName ? <p>{customer.businessName}</p> : null}
                {customer.email ? <p className="text-muted-foreground">{customer.email}</p> : null}
                {customer.address ? <p className="whitespace-pre-wrap text-muted-foreground">{customer.address}</p> : null}
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Unknown customer</p>
            )}
          </div>

          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right tabular-nums">Qty</TableHead>
                  <TableHead className="text-right tabular-nums">Price</TableHead>
                  <TableHead className="text-right tabular-nums">Discount</TableHead>
                  <TableHead className="text-right tabular-nums">Tax</TableHead>
                  <TableHead className="text-right tabular-nums">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.lineItems.map((line, i) => (
                  <TableRow key={i}>
                    <TableCell>{line.name}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{line.qty}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatMoney(line.unitPrice, currency)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatMoney(line.discount, currency)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{line.taxRate}%</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatMoney(line.lineTotal, currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="space-y-3 sm:hidden">
            {invoice.lineItems.map((line, i) => (
              <div key={i} className="rounded-md border border-border p-3 text-sm">
                <div className="flex justify-between font-medium">
                  <span>{line.name}</span>
                  <span className="font-mono tabular-nums">{formatMoney(line.lineTotal, currency)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {line.qty} &times; {formatMoney(line.unitPrice, currency)}
                  {line.discount > 0 ? ` − ${formatMoney(line.discount, currency)} discount` : ''}
                  {line.taxRate > 0 ? ` + ${line.taxRate}% tax` : ''}
                </p>
              </div>
            ))}
          </div>

          <div className="ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-mono tabular-nums">{formatMoney(invoice.subtotal, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span className="font-mono tabular-nums">{formatMoney(invoice.taxTotal, currency)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-1 font-semibold">
              <span>Total</span>
              <span className="font-mono tabular-nums">{formatMoney(invoice.total, currency)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Amount paid</span>
              <span className="font-mono tabular-nums">{formatMoney(invoice.amountPaid, currency)}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Balance due</span>
              <span className="font-mono tabular-nums">{formatMoney(invoice.amountDue, currency)}</span>
            </div>
          </div>

          {invoice.terms || invoice.notes ? (
            <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
              {invoice.terms ? (
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Terms</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{invoice.terms}</p>
                </div>
              ) : null}
              {invoice.notes ? (
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Notes</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{invoice.notes}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <RecordPaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        invoice={invoice}
        currency={currency}
        onRecorded={(updated) => setInvoice(updated)}
      />

      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void invoice?</DialogTitle>
            <DialogDescription>{invoice.invoiceNumber} will be marked void. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setVoidOpen(false)}>
              Keep invoice
            </Button>
            <Button variant="destructive" onClick={handleVoid} disabled={actionLoading}>
              {actionLoading ? 'Voiding...' : 'Void invoice'}
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
      <Skeleton className="h-[36rem]" />
    </div>
  );
}
