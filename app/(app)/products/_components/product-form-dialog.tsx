'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
import { toMinorUnits, toMajorUnits } from '@/lib/money';
import type { Product } from '@/lib/types';

interface ProductFormValues {
  name: string;
  sku: string;
  barcode: string;
  category: string;
  unit: string;
  costPriceInput: string;
  salePriceInput: string;
  taxRate: string;
  reorderPoint: string;
  trackInventory: boolean;
  status: 'active' | 'archived';
}

function emptyForm(): ProductFormValues {
  return {
    name: '',
    sku: '',
    barcode: '',
    category: '',
    unit: 'unit',
    costPriceInput: '0',
    salePriceInput: '0',
    taxRate: '0',
    reorderPoint: '0',
    trackInventory: true,
    status: 'active',
  };
}

function fromProduct(product: Product, currency: string): ProductFormValues {
  return {
    name: product.name,
    sku: product.sku,
    barcode: product.barcode ?? '',
    category: product.category ?? '',
    unit: product.unit,
    costPriceInput: String(toMajorUnits(product.costPrice, currency)),
    salePriceInput: String(toMajorUnits(product.salePrice, currency)),
    taxRate: String(product.taxRate),
    reorderPoint: String(product.reorderPoint),
    trackInventory: product.trackInventory,
    status: product.status,
  };
}

export function ProductFormDialog({
  open,
  onClose,
  currency,
  product,
}: {
  open: boolean;
  onClose: (saved: boolean) => void;
  currency: string;
  product?: Product | null;
}) {
  const { toast } = useToast();
  const [values, setValues] = useState<ProductFormValues>(emptyForm());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [duplicateSku, setDuplicateSku] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isEdit = Boolean(product);

  useEffect(() => {
    if (open) {
      setValues(product ? fromProduct(product, currency) : emptyForm());
      setFieldErrors({});
      setDuplicateSku(null);
    }
  }, [open, product, currency]);

  function set<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (key === 'sku') setDuplicateSku(null);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setFieldErrors({});
    setDuplicateSku(null);
    const payload = {
      name: values.name.trim(),
      sku: values.sku.trim(),
      barcode: values.barcode.trim() || undefined,
      category: values.category.trim() || undefined,
      unit: values.unit.trim() || 'unit',
      costPrice: toMinorUnits(values.costPriceInput || '0', currency),
      salePrice: toMinorUnits(values.salePriceInput || '0', currency),
      taxRate: Number(values.taxRate) || 0,
      reorderPoint: Math.max(0, Math.floor(Number(values.reorderPoint) || 0)),
      trackInventory: values.trackInventory,
      status: values.status,
      variants: product?.variants ?? [],
    };

    try {
      const res = await fetch(isEdit ? `/api/products/${product!._id}` : '/api/products', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        const code = data?.error?.code;
        if (code === 'DUPLICATE') {
          setDuplicateSku('This SKU is already in use.');
        } else if (data?.error?.fields) {
          setFieldErrors(data.error.fields);
        }
        toast({
          title: isEdit ? 'Could not save product' : 'Could not create product',
          description: data?.error?.message ?? 'Please check the form and try again.',
          variant: 'destructive',
        });
        return;
      }
      toast({ title: isEdit ? 'Product updated' : 'Product created', variant: 'success' });
      onClose(true);
    } catch {
      toast({ title: 'Network error', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit product' : 'Add product'}</DialogTitle>
          <DialogDescription>{isEdit ? 'Update this product’s details.' : 'Create a new product.'}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Name *</Label>
            <Input value={values.name} onChange={(e) => set('name', e.target.value)} />
            {fieldErrors.name ? <p className="text-xs text-destructive">{fieldErrors.name}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label>SKU *</Label>
            <Input value={values.sku} onChange={(e) => set('sku', e.target.value)} className={duplicateSku ? 'border-destructive' : ''} />
            {duplicateSku ? <p className="text-xs text-destructive">{duplicateSku}</p> : null}
            {fieldErrors.sku ? <p className="text-xs text-destructive">{fieldErrors.sku}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label>Barcode</Label>
            <Input value={values.barcode} onChange={(e) => set('barcode', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Input value={values.category} onChange={(e) => set('category', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Unit</Label>
            <Input value={values.unit} onChange={(e) => set('unit', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Cost price</Label>
            <Input type="number" min={0} step="0.01" value={values.costPriceInput} onChange={(e) => set('costPriceInput', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Sale price</Label>
            <Input type="number" min={0} step="0.01" value={values.salePriceInput} onChange={(e) => set('salePriceInput', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Tax rate (%)</Label>
            <Input type="number" min={0} max={100} step="0.1" value={values.taxRate} onChange={(e) => set('taxRate', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Reorder point</Label>
            <Input type="number" min={0} value={values.reorderPoint} onChange={(e) => set('reorderPoint', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={values.status} onValueChange={(v) => set('status', v as 'active' | 'archived')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pt-6">
            <Checkbox
              id="trackInventory"
              checked={values.trackInventory}
              onCheckedChange={(c) => set('trackInventory', c === true)}
            />
            <Label htmlFor="trackInventory" className="cursor-pointer font-normal">
              Track inventory for this product
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onClose(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !values.name.trim() || !values.sku.trim()}>
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
