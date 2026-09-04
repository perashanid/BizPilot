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
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { toMinorUnits } from '@/lib/money';
import { PAYMENT_METHODS, type Expense } from '@/lib/types';

interface ExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency: string;
  onSaved: (expense: Expense) => void;
}

/** Reads a File into a data: URL. A small file (receipt photo/PDF) is small enough to store this
 * way for a demo/small-business tool with no upload backend; production scale would move this to
 * real object storage (e.g. S3) and store just the resulting URL. */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

export function ExpenseDialog({ open, onOpenChange, currency, onSaved }: ExpenseDialogProps) {
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState('');
  const [vendor, setVendor] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_METHODS)[number]>('cash');
  const [receiptUrl, setReceiptUrl] = useState<string | undefined>(undefined);
  const [receiptFileName, setReceiptFileName] = useState<string | null>(null);
  const [recurring, setRecurring] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<'weekly' | 'monthly' | 'quarterly' | 'yearly'>('monthly');
  const [taxDeductible, setTaxDeductible] = useState(false);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount('');
      setDate(new Date().toISOString().slice(0, 10));
      setCategory('');
      setVendor('');
      setPaymentMethod('cash');
      setReceiptUrl(undefined);
      setReceiptFileName(null);
      setRecurring(false);
      setRecurrenceFrequency('monthly');
      setTaxDeductible(false);
      setNotes('');
      setErrors({});
    }
  }, [open]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setReceiptUrl(dataUrl);
      setReceiptFileName(file.name);
    } catch {
      toast({ title: 'Could not read that file', variant: 'destructive' });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setSubmitting(true);
    try {
      const body = {
        amount: toMinorUnits(amount || '0', currency),
        date,
        category: category.trim(),
        vendor: vendor.trim() || undefined,
        paymentMethod,
        receiptUrl,
        recurring,
        recurrenceFrequency: recurring ? recurrenceFrequency : undefined,
        taxDeductible,
        notes: notes.trim() || undefined,
      };
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.error?.fields) setErrors(data.error.fields);
        throw new Error(data?.error?.message ?? 'Could not save expense.');
      }
      toast({ title: 'Expense recorded', variant: 'success' });
      onSaved(data as Expense);
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Could not save expense',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add expense</DialogTitle>
            <DialogDescription>Record a business expense.</DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="expense-amount">Amount</Label>
                <Input
                  id="expense-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
                {errors.amount ? <p className="text-xs text-destructive">{errors.amount}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expense-date">Date</Label>
                <Input id="expense-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="expense-category">Category</Label>
                <Input
                  id="expense-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Rent, Utilities, Supplies"
                  required
                />
                {errors.category ? <p className="text-xs text-destructive">{errors.category}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expense-vendor">Vendor</Label>
                <Input id="expense-vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expense-method">Payment method</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as (typeof PAYMENT_METHODS)[number])}>
                <SelectTrigger id="expense-method">
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

            <div className="space-y-1.5">
              <Label htmlFor="expense-receipt">Receipt (image or PDF)</Label>
              <Input id="expense-receipt" type="file" accept="image/*,application/pdf" onChange={handleFileChange} />
              {receiptFileName ? <p className="text-xs text-muted-foreground">Attached: {receiptFileName}</p> : null}
            </div>

            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium">Recurring</p>
                <p className="text-xs text-muted-foreground">Automatically repeat this expense.</p>
              </div>
              <Switch checked={recurring} onCheckedChange={setRecurring} />
            </div>
            {recurring ? (
              <div className="space-y-1.5">
                <Label htmlFor="expense-frequency">Frequency</Label>
                <Select value={recurrenceFrequency} onValueChange={(v) => setRecurrenceFrequency(v as typeof recurrenceFrequency)}>
                  <SelectTrigger id="expense-frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <Checkbox id="expense-tax" checked={taxDeductible} onCheckedChange={(v) => setTaxDeductible(v === true)} />
              <Label htmlFor="expense-tax" className="font-normal">
                Tax deductible
              </Label>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expense-notes">Notes</Label>
              <Textarea id="expense-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : 'Add expense'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
