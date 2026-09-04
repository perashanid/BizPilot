'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { toMinorUnits } from '@/lib/money';
import { PAYMENT_METHODS, type Invoice, type Paginated, type Payment, type PurchaseOrder, type Supplier } from '@/lib/types';
import { Combobox, type ComboboxItem } from './combobox';

type LinkType = 'none' | 'invoice' | 'po';

interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency: string;
  onRecorded: (payment: Payment) => void;
}

export function RecordPaymentDialog({ open, onOpenChange, currency, onRecorded }: RecordPaymentDialogProps) {
  const { toast } = useToast();
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [linkType, setLinkType] = useState<LinkType>('none');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [invoiceId, setInvoiceId] = useState('');
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>('bank');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDirection('in');
    setLinkType('none');
    setInvoiceId('');
    setPurchaseOrderId('');
    setAmount('');
    setDate(new Date().toISOString().slice(0, 10));
    setMethod('bank');
    setReference('');
    setNotes('');
    setErrors({});

    (async () => {
      const [invRes, poRes, supRes] = await Promise.all([
        fetch('/api/invoices?limit=100'),
        fetch('/api/purchase-orders?limit=100'),
        fetch('/api/suppliers?limit=100'),
      ]);
      const invData = await invRes.json();
      const poData = await poRes.json();
      const supData = await supRes.json();
      if (invRes.ok) setInvoices((invData as Paginated<Invoice>).data);
      if (poRes.ok) setPurchaseOrders((poData as Paginated<PurchaseOrder>).data);
      if (supRes.ok) setSuppliers((supData as Paginated<Supplier>).data);
    })();
  }, [open]);

  const supplierMap = new Map(suppliers.map((s) => [s._id, s.name]));
  const invoiceItems: ComboboxItem[] = invoices.map((inv) => ({
    value: inv._id,
    label: inv.invoiceNumber,
    sublabel: `${formatBalance(inv, currency)}`,
  }));
  const poItems: ComboboxItem[] = purchaseOrders.map((po) => ({
    value: po._id,
    label: po.poNumber,
    sublabel: supplierMap.get(po.supplierId) ?? undefined,
  }));

  function formatBalance(inv: Invoice, curr: string) {
    return `Due ${(inv.amountDue / 100).toLocaleString(undefined, { style: 'currency', currency: curr })}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setSubmitting(true);
    try {
      const invoice = invoices.find((i) => i._id === invoiceId);
      const po = purchaseOrders.find((p) => p._id === purchaseOrderId);
      const body = {
        direction,
        amount: toMinorUnits(amount || '0', currency),
        date,
        method,
        reference: reference.trim() || undefined,
        invoiceId: linkType === 'invoice' && invoiceId ? invoiceId : undefined,
        customerId: linkType === 'invoice' ? invoice?.customerId : undefined,
        purchaseOrderId: linkType === 'po' && purchaseOrderId ? purchaseOrderId : undefined,
        supplierId: linkType === 'po' ? po?.supplierId : undefined,
        notes: notes.trim() || undefined,
      };
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.error?.fields) setErrors(data.error.fields);
        throw new Error(data?.error?.message ?? 'Could not record payment.');
      }
      toast({ title: 'Payment recorded', variant: 'success' });
      onRecorded(data as Payment);
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Could not record payment',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
            <DialogDescription>Log money coming in or going out.</DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={direction === 'in' ? 'default' : 'outline'}
                onClick={() => {
                  setDirection('in');
                  setLinkType('none');
                  setPurchaseOrderId('');
                }}
              >
                Received
              </Button>
              <Button
                type="button"
                variant={direction === 'out' ? 'default' : 'outline'}
                onClick={() => {
                  setDirection('out');
                  setLinkType('none');
                  setInvoiceId('');
                }}
              >
                Made
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label>Link to</Label>
              <Select value={linkType} onValueChange={(v) => setLinkType(v as LinkType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Standalone payment</SelectItem>
                  {direction === 'in' ? <SelectItem value="invoice">Invoice</SelectItem> : null}
                  {direction === 'out' ? <SelectItem value="po">Purchase order</SelectItem> : null}
                </SelectContent>
              </Select>
            </div>

            {linkType === 'invoice' ? (
              <div className="space-y-1.5">
                <Label>Invoice</Label>
                <Combobox
                  items={invoiceItems}
                  value={invoiceId}
                  onChange={(v) => {
                    setInvoiceId(v);
                    const inv = invoices.find((i) => i._id === v);
                    if (inv) setAmount(String(inv.amountDue / 100));
                  }}
                  placeholder="Search invoices by number..."
                  searchPlaceholder="Search invoices..."
                  emptyText="No open invoices found."
                />
              </div>
            ) : null}

            {linkType === 'po' ? (
              <div className="space-y-1.5">
                <Label>Purchase order</Label>
                <Combobox
                  items={poItems}
                  value={purchaseOrderId}
                  onChange={(v) => {
                    setPurchaseOrderId(v);
                    const po = purchaseOrders.find((p) => p._id === v);
                    if (po) setAmount(String((po.total - po.amountPaid) / 100));
                  }}
                  placeholder="Search purchase orders..."
                  searchPlaceholder="Search POs..."
                  emptyText="No purchase orders found."
                />
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="payment-amount">Amount</Label>
              <Input
                id="payment-amount"
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
              {errors.amount ? <p className="text-xs text-destructive">{errors.amount}</p> : null}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="payment-date">Date</Label>
                <Input id="payment-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payment-method">Method</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as (typeof PAYMENT_METHODS)[number])}>
                  <SelectTrigger id="payment-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m} className="capitalize">
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="payment-reference">Reference</Label>
              <Input id="payment-reference" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="payment-notes">Notes</Label>
              <Textarea id="payment-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Recording...' : 'Record payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
