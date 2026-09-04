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
import { useToast } from '@/components/ui/use-toast';
import type { PurchaseOrder } from '@/lib/types';

interface ReceiveDraftLine {
  productId: string;
  variantId?: string;
  name: string;
  remaining: number;
  qtyToReceive: string;
}

interface ReceivePoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  po: PurchaseOrder;
  onReceived: (po: PurchaseOrder) => void;
}

/** Lets the user receive some or all of the remaining quantity per line — supports partial receipt. */
export function ReceivePoDialog({ open, onOpenChange, po, onReceived }: ReceivePoDialogProps) {
  const { toast } = useToast();
  const [lines, setLines] = useState<ReceiveDraftLine[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLines(
      po.lineItems
        .map((l) => ({
          productId: l.productId,
          variantId: l.variantId,
          name: l.name,
          remaining: l.qtyOrdered - l.qtyReceived,
          qtyToReceive: String(l.qtyOrdered - l.qtyReceived),
        }))
        .filter((l) => l.remaining > 0)
    );
  }, [open, po]);

  function updateQty(productId: string, variantId: string | undefined, value: string) {
    setLines((prev) =>
      prev.map((l) => (l.productId === productId && l.variantId === variantId ? { ...l, qtyToReceive: value } : l))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const receiveLines = lines
      .map((l) => ({
        productId: l.productId,
        variantId: l.variantId,
        qtyReceived: Math.max(0, Math.min(l.remaining, Math.round(Number(l.qtyToReceive) || 0))),
      }))
      .filter((l) => l.qtyReceived > 0);

    if (receiveLines.length === 0) {
      toast({ title: 'Enter a quantity to receive for at least one line.', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/purchase-orders/${po._id}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: receiveLines }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Could not receive stock.');
      toast({ title: 'Stock received', variant: 'success' });
      onReceived(data as PurchaseOrder);
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Could not receive stock',
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
            <DialogTitle>Receive stock</DialogTitle>
            <DialogDescription>
              Enter the quantity received for each line. Defaults to the full remaining amount — reduce it for a partial
              receipt.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-3">
            {lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing left to receive on this order.</p>
            ) : (
              lines.map((line) => (
                <div
                  key={`${line.productId}-${line.variantId ?? ''}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{line.name}</p>
                    <p className="text-xs text-muted-foreground">{line.remaining} remaining</p>
                  </div>
                  <div className="w-24 shrink-0">
                    <Label className="sr-only" htmlFor={`recv-${line.productId}`}>
                      Quantity to receive for {line.name}
                    </Label>
                    <Input
                      id={`recv-${line.productId}`}
                      type="number"
                      min={0}
                      max={line.remaining}
                      value={line.qtyToReceive}
                      onChange={(e) => updateQty(line.productId, line.variantId, e.target.value)}
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || lines.length === 0}>
              {submitting ? 'Receiving...' : 'Receive stock'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
