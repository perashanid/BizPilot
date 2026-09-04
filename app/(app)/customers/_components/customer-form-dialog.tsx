'use client';

import { useEffect, useState } from 'react';

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
import { toMinorUnits, toMajorUnits } from '@/lib/money';
import type { Customer } from '@/lib/types';

export interface CustomerFormValues {
  name: string;
  businessName: string;
  email: string;
  phone: string;
  address: string;
  taxId: string;
  paymentTermsDays: string;
  creditLimitInput: string;
  tags: string;
  notes: string;
  status: 'active' | 'inactive';
}

function emptyForm(): CustomerFormValues {
  return {
    name: '',
    businessName: '',
    email: '',
    phone: '',
    address: '',
    taxId: '',
    paymentTermsDays: '0',
    creditLimitInput: '0',
    tags: '',
    notes: '',
    status: 'active',
  };
}

function fromCustomer(customer: Customer, currency: string): CustomerFormValues {
  return {
    name: customer.name,
    businessName: customer.businessName ?? '',
    email: customer.email ?? '',
    phone: customer.phone ?? '',
    address: customer.address ?? '',
    taxId: customer.taxId ?? '',
    paymentTermsDays: String(customer.paymentTermsDays ?? 0),
    creditLimitInput: String(toMajorUnits(customer.creditLimit ?? 0, currency)),
    tags: (customer.tags ?? []).join(', '),
    notes: customer.notes ?? '',
    status: customer.status,
  };
}

export function CustomerFormDialog({
  open,
  onClose,
  currency,
  customer,
}: {
  open: boolean;
  onClose: (saved: boolean) => void;
  currency: string;
  customer?: Customer | null;
}) {
  const { toast } = useToast();
  const [values, setValues] = useState<CustomerFormValues>(emptyForm());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const isEdit = Boolean(customer);

  useEffect(() => {
    if (open) {
      setValues(customer ? fromCustomer(customer, currency) : emptyForm());
      setFieldErrors({});
    }
  }, [open, customer, currency]);

  function set<K extends keyof CustomerFormValues>(key: K, value: CustomerFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setFieldErrors({});
    const payload = {
      name: values.name.trim(),
      businessName: values.businessName.trim() || undefined,
      email: values.email.trim() || undefined,
      phone: values.phone.trim() || undefined,
      address: values.address.trim() || undefined,
      taxId: values.taxId.trim() || undefined,
      paymentTermsDays: Number(values.paymentTermsDays) || 0,
      creditLimit: toMinorUnits(values.creditLimitInput || '0', currency),
      tags: values.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      notes: values.notes.trim() || undefined,
      status: values.status,
    };

    try {
      const res = await fetch(isEdit ? `/api/customers/${customer!._id}` : '/api/customers', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.error?.fields) setFieldErrors(data.error.fields);
        toast({
          title: isEdit ? 'Could not save customer' : 'Could not create customer',
          description: data?.error?.message ?? 'Please check the form and try again.',
          variant: 'destructive',
        });
        return;
      }
      toast({ title: isEdit ? 'Customer updated' : 'Customer created', variant: 'success' });
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
          <DialogTitle>{isEdit ? 'Edit customer' : 'Add customer'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update this customer’s details.' : 'Create a new customer record.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Name *</Label>
            <Input value={values.name} onChange={(e) => set('name', e.target.value)} />
            {fieldErrors.name ? <p className="text-xs text-destructive">{fieldErrors.name}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label>Business name</Label>
            <Input value={values.businessName} onChange={(e) => set('businessName', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={values.email} onChange={(e) => set('email', e.target.value)} />
            {fieldErrors.email ? <p className="text-xs text-destructive">{fieldErrors.email}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={values.phone} onChange={(e) => set('phone', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Tax ID</Label>
            <Input value={values.taxId} onChange={(e) => set('taxId', e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Address</Label>
            <Input value={values.address} onChange={(e) => set('address', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Payment terms (days)</Label>
            <Input
              type="number"
              min={0}
              max={365}
              value={values.paymentTermsDays}
              onChange={(e) => set('paymentTermsDays', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Credit limit</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={values.creditLimitInput}
              onChange={(e) => set('creditLimitInput', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tags (comma separated)</Label>
            <Input value={values.tags} onChange={(e) => set('tags', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={values.status} onValueChange={(v) => set('status', v as 'active' | 'inactive')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Notes</Label>
            <Textarea rows={3} value={values.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onClose(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !values.name.trim()}>
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create customer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
