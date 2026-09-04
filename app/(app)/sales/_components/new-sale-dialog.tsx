'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { formatMoney, lineSubtotal, taxForLine, toMinorUnits, toMajorUnits } from '@/lib/money';
import type { Customer, Product } from '@/lib/types';
import { SearchCombobox } from './search-combobox';

interface DraftLine {
  key: string;
  productId: string;
  name: string;
  qty: number;
  unitPriceMinor: number;
  discountMinor: number;
  taxRate: number;
  error?: string;
}

const CHANNELS = [
  { value: 'in_store', label: 'In store' },
  { value: 'online', label: 'Online' },
  { value: 'phone', label: 'Phone' },
  { value: 'wholesale', label: 'Wholesale' },
  { value: 'marketplace', label: 'Marketplace' },
];

export function NewSaleDialog({
  open,
  onClose,
  currency,
}: {
  open: boolean;
  onClose: (created: boolean) => void;
  currency: string;
}) {
  const { toast } = useToast();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [discountTotalInput, setDiscountTotalInput] = useState('0');
  const [channel, setChannel] = useState('in_store');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const discountTotalMinor = toMinorUnits(discountTotalInput || '0', currency);

  const totals = useMemo(() => {
    let subtotal = 0;
    let taxTotal = 0;
    for (const line of lines) {
      subtotal += lineSubtotal(line.qty, line.unitPriceMinor, line.discountMinor);
      taxTotal += taxForLine(line.qty, line.unitPriceMinor, line.discountMinor, line.taxRate);
    }
    const grandTotal = Math.max(0, subtotal + taxTotal - discountTotalMinor);
    return { subtotal, taxTotal, grandTotal };
  }, [lines, discountTotalMinor]);

  function reset() {
    setCustomer(null);
    setLines([]);
    setDiscountTotalInput('0');
    setChannel('in_store');
    setDate(new Date().toISOString().slice(0, 10));
    setNotes('');
    setFormError(null);
  }

  function handleClose(created: boolean) {
    reset();
    onClose(created);
  }

  function addProductLine(product: Product) {
    setLines((prev) => [
      ...prev,
      {
        key: `${product._id}-${Date.now()}`,
        productId: product._id,
        name: product.name,
        qty: 1,
        unitPriceMinor: product.salePrice,
        discountMinor: 0,
        taxRate: product.taxRate,
      },
    ]);
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch, error: undefined } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  async function handleSubmit() {
    setFormError(null);
    if (lines.length === 0) {
      setFormError('Add at least one line item.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customer?._id,
          lineItems: lines.map((l) => ({
            productId: l.productId,
            name: l.name,
            qty: l.qty,
            unitPrice: l.unitPriceMinor,
            discount: l.discountMinor,
            taxRate: l.taxRate,
          })),
          discountTotal: discountTotalMinor,
          channel,
          date: date ? new Date(date).toISOString() : undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const code = data?.error?.code;
        const message: string = data?.error?.message ?? 'Could not create the sale.';
        if (code === 'INSUFFICIENT_STOCK') {
          const match = /need (\d+)/.exec(message);
          const neededQty = match ? Number(match[1]) : null;
          const offendingIndex = neededQty !== null ? lines.findIndex((l) => l.qty === neededQty && !l.error) : -1;
          if (offendingIndex >= 0) {
            setLines((prev) => prev.map((l, i) => (i === offendingIndex ? { ...l, error: message } : l)));
          } else {
            setFormError(message);
          }
        } else if (code === 'VALIDATION_ERROR' && data?.error?.fields) {
          setFormError(Object.values(data.error.fields).join(' '));
        } else {
          setFormError(message);
        }
        toast({ title: 'Could not create sale', description: message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Sale created', description: `Order ${data.orderNumber} recorded.`, variant: 'success' });
      handleClose(true);
    } catch {
      const message = 'Network error. Please try again.';
      setFormError(message);
      toast({ title: 'Could not create sale', description: message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose(false)}>
      <DialogContent className="max-h-[90vh] w-full max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New sale</DialogTitle>
          <DialogDescription>Record a new order and adjust stock automatically.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <SearchCombobox<Customer>
                placeholder="Search customers..."
                fetchUrl={(q) => `/api/customers?search=${encodeURIComponent(q)}&status=active&limit=10`}
                renderItem={(c) => (
                  <span>
                    {c.name}
                    {c.businessName ? <span className="text-muted-foreground"> &middot; {c.businessName}</span> : null}
                  </span>
                )}
                getKey={(c) => c._id}
                onSelect={setCustomer}
                triggerLabel={customer ? customer.name : 'Walk-in / no customer'}
              />
              {customer ? (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => setCustomer(null)}
                >
                  Clear (use Walk-in)
                </button>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label>Channel</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Discount (total)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={discountTotalInput}
                onChange={(e) => setDiscountTotalInput(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Line items</Label>
              <SearchCombobox<Product>
                placeholder="Search products to add..."
                fetchUrl={(q) => `/api/products?search=${encodeURIComponent(q)}&status=active&limit=10`}
                renderItem={(p) => (
                  <span>
                    {p.name} <span className="text-muted-foreground">({p.sku})</span>
                  </span>
                )}
                getKey={(p) => p._id}
                onSelect={addProductLine}
                triggerLabel={
                  <span className="flex items-center gap-1">
                    <Plus className="h-3.5 w-3.5" /> Add product
                  </span>
                }
              />
            </div>

            {lines.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                No line items yet. Search for a product above to add one.
              </p>
            ) : (
              <div className="space-y-2">
                {lines.map((line) => (
                  <div key={line.key} className="rounded-md border border-border p-3">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-2">
                        <p className="text-sm font-medium">{line.name}</p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <div>
                            <Label className="text-xs text-muted-foreground">Qty</Label>
                            <Input
                              type="number"
                              min={1}
                              value={line.qty}
                              onChange={(e) => updateLine(line.key, { qty: Math.max(1, Number(e.target.value) || 1) })}
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Unit price</Label>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={toMajorUnits(line.unitPriceMinor, currency)}
                              onChange={(e) =>
                                updateLine(line.key, { unitPriceMinor: toMinorUnits(e.target.value || '0', currency) })
                              }
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Discount</Label>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={toMajorUnits(line.discountMinor, currency)}
                              onChange={(e) =>
                                updateLine(line.key, { discountMinor: toMinorUnits(e.target.value || '0', currency) })
                              }
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Tax %</Label>
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              step="0.1"
                              value={line.taxRate}
                              onChange={(e) => updateLine(line.key, { taxRate: Number(e.target.value) || 0 })}
                            />
                          </div>
                        </div>
                        {line.error ? <p className="text-xs text-destructive">{line.error}</p> : null}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => removeLine(line.key)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <span className="font-mono text-sm tabular-nums">
                          {formatMoney(
                            lineSubtotal(line.qty, line.unitPriceMinor, line.discountMinor) +
                              taxForLine(line.qty, line.unitPriceMinor, line.discountMinor, line.taxRate),
                            currency
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <div className="space-y-1 rounded-md bg-muted/50 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-mono tabular-nums">{formatMoney(totals.subtotal, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span className="font-mono tabular-nums">{formatMoney(totals.taxTotal, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Discount</span>
              <span className="font-mono tabular-nums">-{formatMoney(discountTotalMinor, currency)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span className="font-mono tabular-nums">{formatMoney(totals.grandTotal, currency)}</span>
            </div>
          </div>

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => handleClose(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create sale'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
