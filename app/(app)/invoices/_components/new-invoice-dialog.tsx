'use client';

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Plus, Trash2 } from 'lucide-react';

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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { formatMoney, lineSubtotal, taxForLine, toMajorUnits, toMinorUnits } from '@/lib/money';
import type { Business, Customer, Invoice, Paginated, Product } from '@/lib/types';
import { Combobox, type ComboboxItem } from './combobox';

interface DraftLine {
  key: string;
  productId?: string;
  name: string;
  qty: string;
  unitPrice: string;
  discount: string;
  taxRate: string;
}

function emptyLine(): DraftLine {
  return { key: Math.random().toString(36).slice(2), name: '', qty: '1', unitPrice: '0', discount: '0', taxRate: '0' };
}

interface NewInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (invoice: Invoice) => void;
  business: Business | null;
}

export function NewInvoiceDialog({ open, onOpenChange, onCreated, business }: NewInvoiceDialogProps) {
  const { toast } = useToast();
  const currency = business?.currency ?? 'USD';

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(() => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const [terms, setTerms] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCustomerId('');
    setLines([emptyLine()]);
    setIssueDate(new Date().toISOString().slice(0, 10));
    setDueDate(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
    setTerms(business?.invoiceSettings.terms ?? '');
    setNotes('');
    setErrors({});

    (async () => {
      const [custRes, prodRes] = await Promise.all([
        fetch('/api/customers?limit=100&status=active'),
        fetch('/api/products?limit=100&status=active'),
      ]);
      const custData = await custRes.json();
      const prodData = await prodRes.json();
      if (custRes.ok) setCustomers((custData as Paginated<Customer>).data);
      if (prodRes.ok) setProducts((prodData as Paginated<Product>).data);
    })();
  }, [open, business]);

  const customerItems: ComboboxItem[] = customers.map((c) => ({ value: c._id, label: c.name, sublabel: c.email }));
  const productItems: ComboboxItem[] = products.map((p) => ({ value: p._id, label: p.name, sublabel: p.sku }));
  const selectedCustomer = customers.find((c) => c._id === customerId);

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function selectProductForLine(key: string, productId: string) {
    const product = products.find((p) => p._id === productId);
    updateLine(key, {
      productId,
      name: product?.name ?? '',
      unitPrice: product ? String(toMajorUnits(product.salePrice, currency)) : '0',
      taxRate: product ? String(product.taxRate) : '0',
    });
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  const preview = useMemo(() => {
    let subtotal = 0;
    let taxTotal = 0;
    const rows = lines.map((l) => {
      const qty = Math.max(0, Math.round(Number(l.qty) || 0));
      const unitPrice = toMinorUnits(l.unitPrice || '0', currency);
      const discount = toMinorUnits(l.discount || '0', currency);
      const taxRate = Number(l.taxRate) || 0;
      const sub = lineSubtotal(qty, unitPrice, discount);
      const tax = taxForLine(qty, unitPrice, discount, taxRate);
      subtotal += sub;
      taxTotal += tax;
      return { key: l.key, name: l.name || 'Untitled item', qty, lineTotal: sub + tax };
    });
    return { rows, subtotal, taxTotal, total: subtotal + taxTotal };
  }, [lines, currency]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    if (!customerId) {
      setErrors({ customerId: 'Select a customer.' });
      return;
    }
    const validLines = lines.filter((l) => l.name.trim() && Number(l.qty) > 0);
    if (validLines.length === 0) {
      setErrors({ lineItems: 'Add at least one line item.' });
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        customerId,
        lineItems: validLines.map((l) => ({
          productId: l.productId,
          name: l.name.trim(),
          qty: Math.max(1, Math.round(Number(l.qty) || 1)),
          unitPrice: toMinorUnits(l.unitPrice || '0', currency),
          discount: toMinorUnits(l.discount || '0', currency),
          taxRate: Number(l.taxRate) || 0,
        })),
        issueDate,
        dueDate,
        terms: terms.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.error?.fields) setErrors(data.error.fields);
        throw new Error(data?.error?.message ?? 'Could not create invoice.');
      }
      toast({ title: 'Invoice created', variant: 'success' });
      onCreated(data as Invoice);
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Could not create invoice',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New invoice</DialogTitle>
            <DialogDescription>Bill a customer for goods or services.</DialogDescription>
          </DialogHeader>

          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Customer</Label>
                <Combobox
                  items={customerItems}
                  value={customerId}
                  onChange={setCustomerId}
                  placeholder="Select a customer..."
                  searchPlaceholder="Search customers..."
                  emptyText="No active customers found."
                />
                {errors.customerId ? <p className="text-xs text-destructive">{errors.customerId}</p> : null}
              </div>

              <div className="space-y-2">
                <Label>Line items</Label>
                {errors.lineItems ? <p className="text-xs text-destructive">{errors.lineItems}</p> : null}
                <div className="space-y-2">
                  {lines.map((line) => (
                    <div key={line.key} className="space-y-2 rounded-md border border-border p-3">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <Combobox
                            items={productItems}
                            value={line.productId}
                            onChange={(v) => selectProductForLine(line.key, v)}
                            placeholder="Pick a product (optional)..."
                            searchPlaceholder="Search products..."
                            emptyText="No products found."
                          />
                        </div>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(line.key)} disabled={lines.length === 1}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <Input
                        placeholder="Line description"
                        value={line.name}
                        onChange={(e) => updateLine(line.key, { name: e.target.value })}
                      />
                      <div className="grid grid-cols-4 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Qty</Label>
                          <Input type="number" min={1} value={line.qty} onChange={(e) => updateLine(line.key, { qty: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Price</Label>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.unitPrice}
                            onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Discount</Label>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.discount}
                            onChange={(e) => updateLine(line.key, { discount: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Tax %</Label>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step="0.1"
                            value={line.taxRate}
                            onChange={(e) => updateLine(line.key, { taxRate: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" className="gap-2" onClick={addLine}>
                  <Plus className="h-4 w-4" />
                  Add line
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="inv-issue">Issue date</Label>
                  <Input id="inv-issue" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inv-due">Due date</Label>
                  <Input id="inv-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
                  {errors.dueDate ? <p className="text-xs text-destructive">{errors.dueDate}</p> : null}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="inv-terms">Terms</Label>
                <Textarea id="inv-terms" value={terms} onChange={(e) => setTerms(e.target.value)} rows={2} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-notes">Notes</Label>
                <Textarea id="inv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
            </div>

            {/* Live preview */}
            <Card className="h-fit bg-muted/20">
              <CardHeader>
                <CardTitle className="text-sm">Preview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <p className="font-display text-lg font-semibold">{business?.name ?? 'Your business'}</p>
                  <p className="text-xs text-muted-foreground">Invoice</p>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Bill to: {selectedCustomer?.name ?? 'No customer selected'}</span>
                  <span>Due {dueDate ? format(new Date(dueDate), 'MMM d, yyyy') : '—'}</span>
                </div>
                <div className="space-y-1 border-t border-border pt-2">
                  {preview.rows.map((row) => (
                    <div key={row.key} className="flex justify-between">
                      <span className="truncate pr-2">
                        {row.qty} &times; {row.name}
                      </span>
                      <span className="shrink-0 font-mono tabular-nums">{formatMoney(row.lineTotal, currency)}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-1 border-t border-border pt-2">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span className="font-mono tabular-nums">{formatMoney(preview.subtotal, currency)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Tax</span>
                    <span className="font-mono tabular-nums">{formatMoney(preview.taxTotal, currency)}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>Total</span>
                    <span className="font-mono tabular-nums">{formatMoney(preview.total, currency)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create invoice'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
