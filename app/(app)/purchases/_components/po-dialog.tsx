'use client';

import { useEffect, useState } from 'react';
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
import { useToast } from '@/components/ui/use-toast';
import { formatMoney, toMinorUnits, toMajorUnits } from '@/lib/money';
import type { Paginated, Product, PurchaseOrder, Supplier } from '@/lib/types';
import { Combobox, type ComboboxItem } from './combobox';

interface DraftLine {
  key: string;
  productId: string;
  name: string;
  sku?: string;
  qtyOrdered: string;
  unitCost: string; // major units, e.g. "12.50"
}

function emptyLine(): DraftLine {
  return { key: Math.random().toString(36).slice(2), productId: '', name: '', qtyOrdered: '1', unitCost: '0' };
}

interface NewPoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (po: PurchaseOrder) => void;
  currency: string;
}

export function NewPoDialog({ open, onOpenChange, onCreated, currency }: NewPoDialogProps) {
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [shipping, setShipping] = useState('0');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setSupplierId('');
    setLines([emptyLine()]);
    setShipping('0');
    setExpectedDate('');
    setNotes('');
    setErrors({});

    (async () => {
      const [supRes, prodRes] = await Promise.all([
        fetch('/api/suppliers?limit=100&status=active'),
        fetch('/api/products?limit=100&status=active'),
      ]);
      const supData = await supRes.json();
      const prodData = await prodRes.json();
      if (supRes.ok) setSuppliers((supData as Paginated<Supplier>).data);
      if (prodRes.ok) setProducts((prodData as Paginated<Product>).data);
    })();
  }, [open]);

  const supplierItems: ComboboxItem[] = suppliers.map((s) => ({ value: s._id, label: s.name, sublabel: s.email }));
  const productItems: ComboboxItem[] = products.map((p) => ({ value: p._id, label: p.name, sublabel: p.sku }));

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function selectProductForLine(key: string, productId: string) {
    const product = products.find((p) => p._id === productId);
    updateLine(key, {
      productId,
      name: product?.name ?? '',
      sku: product?.sku,
      unitCost: product ? String(toMajorUnits(product.costPrice, currency)) : '0',
    });
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  const subtotal = lines.reduce((sum, l) => {
    const qty = Number(l.qtyOrdered) || 0;
    const cost = toMinorUnits(l.unitCost || '0', currency);
    return sum + qty * cost;
  }, 0);
  const shippingMinor = toMinorUnits(shipping || '0', currency);
  const total = subtotal + shippingMinor;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    if (!supplierId) {
      setErrors({ supplierId: 'Select a supplier.' });
      return;
    }
    const validLines = lines.filter((l) => l.productId && Number(l.qtyOrdered) > 0);
    if (validLines.length === 0) {
      setErrors({ lineItems: 'Add at least one line item.' });
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        supplierId,
        lineItems: validLines.map((l) => ({
          productId: l.productId,
          name: l.name,
          sku: l.sku,
          qtyOrdered: Math.max(1, Math.round(Number(l.qtyOrdered) || 1)),
          unitCost: toMinorUnits(l.unitCost || '0', currency),
        })),
        shipping: shippingMinor,
        expectedDate: expectedDate || undefined,
        notes: notes.trim() || undefined,
      };
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.error?.fields) setErrors(data.error.fields);
        throw new Error(data?.error?.message ?? 'Could not create purchase order.');
      }
      toast({ title: 'Purchase order created', variant: 'success' });
      onCreated(data as PurchaseOrder);
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Could not create purchase order',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New purchase order</DialogTitle>
            <DialogDescription>Order stock from a supplier.</DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label>Supplier</Label>
              <Combobox
                items={supplierItems}
                value={supplierId}
                onChange={setSupplierId}
                placeholder="Select a supplier..."
                searchPlaceholder="Search suppliers..."
                emptyText="No active suppliers found."
              />
              {errors.supplierId ? <p className="text-xs text-destructive">{errors.supplierId}</p> : null}
            </div>

            <div className="space-y-2">
              <Label>Line items</Label>
              {errors.lineItems ? <p className="text-xs text-destructive">{errors.lineItems}</p> : null}
              <div className="space-y-2">
                {lines.map((line) => (
                  <div key={line.key} className="grid grid-cols-1 gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_5rem_6rem_2rem] sm:items-end">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Product</Label>
                      <Combobox
                        items={productItems}
                        value={line.productId}
                        onChange={(v) => selectProductForLine(line.key, v)}
                        placeholder="Select product..."
                        searchPlaceholder="Search products..."
                        emptyText="No active products found."
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Qty</Label>
                      <Input
                        type="number"
                        min={1}
                        value={line.qtyOrdered}
                        onChange={(e) => updateLine(line.key, { qtyOrdered: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Unit cost</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.unitCost}
                        onChange={(e) => updateLine(line.key, { unitCost: e.target.value })}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLine(line.key)}
                      disabled={lines.length === 1}
                      aria-label="Remove line"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
                <Label htmlFor="po-shipping">Shipping cost</Label>
                <Input id="po-shipping" type="number" min={0} step="0.01" value={shipping} onChange={(e) => setShipping(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="po-expected">Expected date</Label>
                <Input id="po-expected" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="po-notes">Notes</Label>
              <Textarea id="po-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>

            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono tabular-nums">{formatMoney(subtotal, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span className="font-mono tabular-nums">{formatMoney(shippingMinor, currency)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold">
                <span>Total</span>
                <span className="font-mono tabular-nums">{formatMoney(total, currency)}</span>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create purchase order'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
