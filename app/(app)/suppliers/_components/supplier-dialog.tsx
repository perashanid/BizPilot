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
import type { Supplier } from '@/lib/types';

interface SupplierFormState {
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  paymentTermsDays: string;
  leadTimeDays: string;
  notes: string;
  status: 'active' | 'inactive';
}

const EMPTY_FORM: SupplierFormState = {
  name: '',
  contactPerson: '',
  email: '',
  phone: '',
  address: '',
  paymentTermsDays: '30',
  leadTimeDays: '7',
  notes: '',
  status: 'active',
};

function supplierToForm(supplier: Supplier): SupplierFormState {
  return {
    name: supplier.name,
    contactPerson: supplier.contactPerson ?? '',
    email: supplier.email ?? '',
    phone: supplier.phone ?? '',
    address: supplier.address ?? '',
    paymentTermsDays: String(supplier.paymentTermsDays),
    leadTimeDays: String(supplier.leadTimeDays),
    notes: supplier.notes ?? '',
    status: supplier.status,
  };
}

interface SupplierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier?: Supplier | null;
  onSaved: (supplier: Supplier) => void;
}

/** Create/edit dialog shared by the suppliers list page (create) and detail page (edit). */
export function SupplierDialog({ open, onOpenChange, supplier, onSaved }: SupplierDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<SupplierFormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(supplier ? supplierToForm(supplier) : EMPTY_FORM);
      setErrors({});
    }
  }, [open, supplier]);

  function setField<K extends keyof SupplierFormState>(key: K, value: SupplierFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});

    const body = {
      name: form.name.trim(),
      contactPerson: form.contactPerson.trim() || undefined,
      email: form.email.trim(),
      phone: form.phone.trim() || undefined,
      address: form.address.trim() || undefined,
      paymentTermsDays: Number(form.paymentTermsDays) || 0,
      leadTimeDays: Number(form.leadTimeDays) || 0,
      notes: form.notes.trim() || undefined,
      status: form.status,
    };

    try {
      const res = await fetch(supplier ? `/api/suppliers/${supplier._id}` : '/api/suppliers', {
        method: supplier ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.error?.fields) setErrors(data.error.fields);
        throw new Error(data?.error?.message ?? 'Could not save supplier.');
      }
      toast({ title: supplier ? 'Supplier updated' : 'Supplier added', variant: 'success' });
      onSaved(data as Supplier);
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Could not save supplier',
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
            <DialogTitle>{supplier ? 'Edit supplier' : 'Add supplier'}</DialogTitle>
            <DialogDescription>
              {supplier ? 'Update this supplier’s details.' : 'Add a new supplier to purchase from.'}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="supplier-name">Name</Label>
              <Input
                id="supplier-name"
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                required
              />
              {errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="supplier-contact">Contact person</Label>
                <Input
                  id="supplier-contact"
                  value={form.contactPerson}
                  onChange={(e) => setField('contactPerson', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="supplier-email">Email</Label>
                <Input
                  id="supplier-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setField('email', e.target.value)}
                />
                {errors.email ? <p className="text-xs text-destructive">{errors.email}</p> : null}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="supplier-phone">Phone</Label>
                <Input id="supplier-phone" value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="supplier-status">Status</Label>
                <Select value={form.status} onValueChange={(v) => setField('status', v as 'active' | 'inactive')}>
                  <SelectTrigger id="supplier-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="supplier-address">Address</Label>
              <Textarea
                id="supplier-address"
                value={form.address}
                onChange={(e) => setField('address', e.target.value)}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="supplier-terms">Payment terms (days)</Label>
                <Input
                  id="supplier-terms"
                  type="number"
                  min={0}
                  max={365}
                  value={form.paymentTermsDays}
                  onChange={(e) => setField('paymentTermsDays', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="supplier-lead">Lead time (days)</Label>
                <Input
                  id="supplier-lead"
                  type="number"
                  min={0}
                  max={365}
                  value={form.leadTimeDays}
                  onChange={(e) => setField('leadTimeDays', e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="supplier-notes">Notes</Label>
              <Textarea id="supplier-notes" value={form.notes} onChange={(e) => setField('notes', e.target.value)} rows={3} />
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : supplier ? 'Save changes' : 'Add supplier'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
