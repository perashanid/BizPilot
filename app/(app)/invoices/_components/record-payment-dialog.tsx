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
import { toMinorUnits, toMajorUnits } from '@/lib/money';
import { PAYMENT_METHODS, type Invoice } from '@/lib/types';

interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice;
  currency: string;
  onRecorded: (invoice: Invoice) => void;
}

export function RecordPaymentDialog({ open, onOpenChange, invoice, currency, onRecorded }: RecordPaymentDialogProps) {
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>('bank');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(String(toMajorUnits(invoice.amountDue, currency)));
      setDate(new Date().toISOString().slice(0, 10));
      setMethod('bank');
      setReference('');
      setNotes('');
      setErrors({});
    }
  }, [open, invoice, currency]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setSubmitting(true);
    try {
      const body = {
        amount: toMinorUnits(amount || '0', currency),
        date,
        method,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      const res = await fetch(`/api/invoices/${invoice._id}/record-payment`, {
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
      const invRes = await fetch(`/api/invoices/${invoice._id}`);
      const invData = await invRes.json();
      if (invRes.ok) onRecorded(invData as Invoice);
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
            <DialogDescription>Invoice {invoice.invoiceNumber}</DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
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
              <Input id="payment-reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Cheque #, transaction id..." />
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
