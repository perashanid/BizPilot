'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { Plus, Search, FileText } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/money';
import type { Business, Customer, Invoice, InvoiceStatus, Paginated } from '@/lib/types';
import { NewInvoiceDialog } from './_components/new-invoice-dialog';

function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);
  return debounced;
}

const STATUS_TABS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'partially_paid', label: 'Partially Paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'void', label: 'Void' },
];

function statusVariant(status: InvoiceStatus): 'success' | 'secondary' | 'warning' | 'destructive' | 'outline' {
  switch (status) {
    case 'paid':
      return 'success';
    case 'sent':
      return 'secondary';
    case 'partially_paid':
      return 'warning';
    case 'overdue':
      return 'destructive';
    case 'void':
      return 'destructive';
    default:
      return 'outline';
  }
}

export default function InvoicesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '');
  const debouncedSearch = useDebouncedValue(searchInput);
  const status = searchParams.get('status') ?? 'all';
  const page = Number(searchParams.get('page') ?? '1');

  const [result, setResult] = useState<Paginated<Invoice> | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(searchParams.get('new') === '1');

  function updateParams(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === '') params.delete(key);
      else params.set(key, value);
    }
    router.replace(`${pathname}?${params.toString()}`);
  }

  useEffect(() => {
    updateParams({ search: debouncedSearch || undefined, page: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    (async () => {
      const [custRes, meRes] = await Promise.all([fetch('/api/customers?limit=100'), fetch('/api/auth/me')]);
      const custData = await custRes.json();
      const meData = await meRes.json();
      if (custRes.ok) setCustomers((custData as Paginated<Customer>).data);
      setBusiness(meData?.business ?? null);
    })();
  }, []);

  const customerMap = new Map(customers.map((c) => [c._id, c.name]));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page || 1));
      params.set('limit', '20');
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (status !== 'all') params.set('status', status);
      const res = await fetch(`/api/invoices?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Could not load invoices.');
      setResult(data as Paginated<Invoice>);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load invoices.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, status]);

  useEffect(() => {
    load();
  }, [load]);

  const currency = business?.currency ?? 'USD';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Invoices</h1>
          <p className="text-sm text-muted-foreground">Bill customers and track what's owed.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New invoice
        </Button>
      </div>

      <Tabs value={status} onValueChange={(v) => updateParams({ status: v === 'all' ? undefined : v, page: undefined })}>
        <TabsList className="flex-wrap">
          {STATUS_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="relative sm:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search invoice number..."
          className="pl-8"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>

      {loading ? (
        <InvoicesSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !result || result.data.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No invoices found"
          description="Create an invoice to start billing customers."
          action={
            <Button onClick={() => setDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              New invoice
            </Button>
          }
        />
      ) : (
        <>
          <Card className="hidden overflow-hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Issue date</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right tabular-nums">Total</TableHead>
                  <TableHead className="text-right tabular-nums">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.data.map((invoice) => (
                  <TableRow
                    key={invoice._id}
                    className={cn(invoice.status === 'overdue' && 'bg-destructive/5 hover:bg-destructive/10')}
                  >
                    <TableCell className="font-medium">
                      <Link href={`/invoices/${invoice._id}`} className="hover:underline">
                        {invoice.invoiceNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{customerMap.get(invoice.customerId) ?? 'Unknown customer'}</TableCell>
                    <TableCell>{format(new Date(invoice.issueDate), 'MMM d, yyyy')}</TableCell>
                    <TableCell>{format(new Date(invoice.dueDate), 'MMM d, yyyy')}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(invoice.status)}>{invoice.status.replace('_', ' ')}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatMoney(invoice.total, currency)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatMoney(invoice.amountDue, currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <div className="space-y-3 sm:hidden">
            {result.data.map((invoice) => (
              <Link key={invoice._id} href={`/invoices/${invoice._id}`}>
                <Card className={cn(invoice.status === 'overdue' && 'border-destructive/40 bg-destructive/5')}>
                  <CardContent className="space-y-1.5 p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{invoice.invoiceNumber}</p>
                      <Badge variant={statusVariant(invoice.status)}>{invoice.status.replace('_', ' ')}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{customerMap.get(invoice.customerId) ?? 'Unknown customer'}</p>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-xs text-muted-foreground">Due {format(new Date(invoice.dueDate), 'MMM d, yyyy')}</span>
                      <span className="font-mono tabular-nums">{formatMoney(invoice.amountDue, currency)}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          <PaginationBar
            page={result.pagination.page}
            totalPages={result.pagination.totalPages}
            total={result.pagination.total}
            onPageChange={(p) => updateParams({ page: String(p) })}
          />
        </>
      )}

      <NewInvoiceDialog open={dialogOpen} onOpenChange={setDialogOpen} business={business} onCreated={() => load()} />
    </div>
  );
}

function InvoicesSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

function PaginationBar({
  page,
  totalPages,
  total,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        Page {page} of {totalPages} &middot; {total} total
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
