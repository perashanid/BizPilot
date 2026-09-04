'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import type { Product } from '@/lib/types';
import { SearchCombobox } from './search-combobox';

export function StockAdjustDialog({ open, onClose }: { open: boolean; onClose: (adjusted: boolean) => void }) {
  const { toast } = useToast();
  const [product, setProduct] = useState<Product | null>(null);
  const [location, setLocation] = useState('default');
  const [delta, setDelta] = useState('0');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setProduct(null);
    setLocation('default');
    setDelta('0');
    setReason('');
    setError(null);
  }

  async function handleSubmit() {
    setError(null);
    const deltaNum = Math.trunc(Number(delta));
    if (!product) {
      setError('Select a product to adjust.');
      return;
    }
    if (!deltaNum) {
      setError('Enter a non-zero adjustment.');
      return;
    }
    if (!reason.trim()) {
      setError('A reason is required.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/inventory/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product._id,
          location: location.trim() || 'default',
          delta: deltaNum,
          reason: reason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? 'Could not adjust stock.');
        toast({ title: 'Adjustment failed', description: data?.error?.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Stock adjusted', description: `New quantity: ${data.quantityAfter}.`, variant: 'success' });
      reset();
      onClose(true);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose(false);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>Manually correct on-hand quantity for a product.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Product</Label>
            <SearchCombobox<Product>
              placeholder="Search products..."
              fetchUrl={(q) => `/api/products?search=${encodeURIComponent(q)}&limit=10`}
              renderItem={(p) => (
                <span>
                  {p.name} <span className="text-muted-foreground">({p.sku})</span>
                </span>
              )}
              getKey={(p) => p._id}
              onSelect={setProduct}
              triggerLabel={product ? `${product.name} (${product.sku})` : 'Select a product...'}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Adjustment (+/-)</Label>
              <Input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Reason *</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Cycle count correction" />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => {
              reset();
              onClose(false);
            }}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Saving…' : 'Apply adjustment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
