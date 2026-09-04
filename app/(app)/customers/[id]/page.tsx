'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { format, differenceInDays } from 'date-fns';
import { ArrowLeft, Pencil, UserX, AlertTriangle, Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { formatMoney } from '@/lib/money';
import type { Business, CustomerWithStats, Sale, Invoice, Payment, InvoiceStatus, SaleStatus, Paginated } from '@/lib/types';
import { CustomerFormDialog } from '../_components/customer-form-dialog';

const SALE_STATUS_BADGE: Record<SaleStatus, 'success' | 'secondary' | 'warning' | 'destructive' | 'outline'> = {
  draft: 'outline',
  confirmed: 'secondary',
  fulfilled: 'success',
  cancelled: 'destructive',
  refunded: 'warning',
};

const INVOICE_STATUS_BADGE: Record<InvoiceStatus, 'success' | 'secondary' | 'warning' | 'destructive' | 'outline'> = {
  draft: 'outline',
  sent: 'secondary',
  partially_paid: 'warning',
  paid: 'success',
  overdue: 'destructive',
  void: 'outline',
};

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();

  const [customer, setCustomer] = useState<CustomerWithStats | null>(null);
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    fetch(`/api/customers/${params.id}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load customer');
        return r.json();
      })
      .then((data: CustomerWithStats) => {
        setCustomer(data);
        setNotesDraft(data.notes ?? '');
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data: { business: Business | null }) => setCurrency(data.business?.currency || 'USD'))
      .catch(() => setCurrency('USD'));
  }, []);

  async function handleDeactivate() {
    setDeactivating(true);
    try {
      const res = await fetch(`/api/customers/${params.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Could not deactivate', description: data?.error?.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Customer deactivated', variant: 'success' });
      setDeactivateOpen(false);
      load();
    } catch {
      toast({ title: 'Network error', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setDeactivating(false);
    }
  }

  async function handleSaveNotes() {
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/customers/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notesDraft.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Could not save notes', description: data?.error?.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Notes saved', variant: 'success' });
      load();
    } catch {
      toast({ title: 'Network error', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setSavingNotes(false);
    }
  }

  if (loading) return <CustomerDetailSkeleton />;
  if (error || !customer) return <ErrorState message="Could not load this customer." onRetry={load} />;

  const daysSinceLastOrder = customer.lastOrderDate ? differenceInDays(new Date(), new Date(customer.lastOrderDate)) : null;
  const isChurnRisk = daysSinceLastOrder === null || daysSinceLastOrder > 60;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push('/customers')}>
        <ArrowLeft className="h-4 w-4" />
        Back to customers
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold">{customer.name}</h1>
            <Badge variant={customer.status === 'active' ? 'success' : 'outline'}>{customer.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {[customer.businessName, customer.email, customer.phone].filter(Boolean).join(' · ') || 'No contact details on file'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          {customer.status === 'active' ? (
            <Button variant="destructive" size="sm" onClick={() => setDeactivateOpen(true)}>
              <UserX className="h-4 w-4" />
              Deactivate
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Lifetime spend</CardDescription>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-2xl font-semibold tabular-nums">
              {formatMoney(customer.totalSpend, currency)}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Outstanding balance</CardDescription>
          </CardHeader>
          <CardContent>
            <span
              className={`font-mono text-2xl font-semibold tabular-nums ${customer.outstandingBalance > 0 ? 'text-destructive' : ''}`}
            >
              {formatMoney(customer.outstandingBalance, currency)}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Last order</CardDescription>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-2xl font-semibold tabular-nums">
              {customer.lastOrderDate ? format(new Date(customer.lastOrderDate), 'MMM d, yyyy') : 'Never'}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* AI panel: lightweight client-side churn heuristic */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Copilot read</CardTitle>
        </CardHeader>
        <CardContent>
          {isChurnRisk ? (
            <div className="flex items-start gap-2 rounded-md bg-warning/10 p-3 text-sm text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {daysSinceLastOrder === null
                  ? 'This customer has never placed an order.'
                  : `No orders in over ${daysSinceLastOrder} days. Consider reaching out.`}
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Ordering activity looks healthy — last order {daysSinceLastOrder} days ago.</p>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="orders">
          <OrdersTab customerId={customer._id} currency={currency} />
        </TabsContent>
        <TabsContent value="invoices">
          <InvoicesTab customerId={customer._id} currency={currency} />
        </TabsContent>
        <TabsContent value="payments">
          <PaymentsTab customerId={customer._id} currency={currency} />
        </TabsContent>
        <TabsContent value="notes">
          <Card>
            <CardContent className="space-y-3 pt-6">
              <Textarea rows={6} value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} />
              <Button size="sm" onClick={handleSaveNotes} disabled={savingNotes || notesDraft === (customer.notes ?? '')}>
                <Save className="h-4 w-4" />
                {savingNotes ? 'Saving…' : 'Save notes'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CustomerFormDialog
        open={editOpen}
        onClose={(saved) => {
          setEditOpen(false);
          if (saved) load();
        }}
        currency={currency}
        customer={customer}
      />

      <Dialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate this customer?</DialogTitle>
            <DialogDescription>
              This marks {customer.name} as inactive. Their order and invoice history is kept. You can reactivate later
              via Edit.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeactivateOpen(false)} disabled={deactivating}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeactivate} disabled={deactivating}>
              {deactivating ? 'Deactivating…' : 'Deactivate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OrdersTab({ customerId, currency }: { customerId: string; currency: string }) {
  const [data, setData] = useState<Paginated<Sale> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/customers/${customerId}/orders?limit=20`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [customerId]);

  if (loading) return <Skeleton className="h-40 w-full" />;
  const rows = data?.data ?? [];
  if (rows.length === 0) return <EmptyState title="No orders yet" description="Sales for this customer will appear here." />;

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((sale) => (
            <TableRow key={sale._id}>
              <TableCell>
                <Link href={`/sales/${sale._id}`} className="font-medium hover:underline">
                  {sale.orderNumber}
                </Link>
              </TableCell>
              <TableCell className="font-mono tabular-nums">{format(new Date(sale.date), 'MMM d, yyyy')}</TableCell>
              <TableCell>
                <Badge variant={SALE_STATUS_BADGE[sale.status]}>{sale.status}</Badge>
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">{formatMoney(sale.grandTotal, currency)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function InvoicesTab({ customerId, currency }: { customerId: string; currency: string }) {
  const [data, setData] = useState<Paginated<Invoice> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/customers/${customerId}/invoices?limit=20`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [customerId]);

  if (loading) return <Skeleton className="h-40 w-full" />;
  const rows = data?.data ?? [];
  if (rows.length === 0)
    return <EmptyState title="No invoices yet" description="Invoices for this customer will appear here." />;

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice</TableHead>
            <TableHead>Due date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Amount due</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((inv) => (
            <TableRow key={inv._id}>
              <TableCell className="font-medium">{inv.invoiceNumber}</TableCell>
              <TableCell className="font-mono tabular-nums">{format(new Date(inv.dueDate), 'MMM d, yyyy')}</TableCell>
              <TableCell>
                <Badge variant={INVOICE_STATUS_BADGE[inv.status] ?? 'secondary'}>{inv.status}</Badge>
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">{formatMoney(inv.amountDue, currency)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function PaymentsTab({ customerId, currency }: { customerId: string; currency: string }) {
  const [data, setData] = useState<Paginated<Payment> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/customers/${customerId}/payments?limit=20`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [customerId]);

  if (loading) return <Skeleton className="h-40 w-full" />;
  const rows = data?.data ?? [];
  if (rows.length === 0)
    return <EmptyState title="No payments yet" description="Payments recorded for this customer will appear here." />;

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Method</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => (
            <TableRow key={p._id}>
              <TableCell className="font-mono tabular-nums">{format(new Date(p.date), 'MMM d, yyyy')}</TableCell>
              <TableCell className="capitalize">{p.method}</TableCell>
              <TableCell>{p.reference || '—'}</TableCell>
              <TableCell
                className={`text-right font-mono tabular-nums ${p.direction === 'in' ? 'text-success' : 'text-destructive'}`}
              >
                {p.direction === 'in' ? '+' : '-'}
                {formatMoney(p.amount, currency)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function CustomerDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-16 w-full" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
