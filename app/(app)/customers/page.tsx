'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { LayoutGrid, List, Plus, Search, Users, ChevronLeft, ChevronRight, Mail, Phone } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Customer, Paginated } from '@/lib/types';
import { CustomerFormDialog } from './_components/customer-form-dialog';

type ViewMode = 'table' | 'grid';
const VIEW_KEY = 'sme-copilot:customers-view';

export default function CustomersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const page = Number(searchParams.get('page') || '1') || 1;
  const search = searchParams.get('search') || '';
  const status = searchParams.get('status') || 'all';

  const [searchInput, setSearchInput] = useState(search);
  const [view, setView] = useState<ViewMode>('table');
  const [currency, setCurrency] = useState('USD');
  const [result, setResult] = useState<Paginated<Customer> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIEW_KEY);
      if (stored === 'grid' || stored === 'table') setView(stored);
    } catch {
      // ignore
    }
  }, []);

  function changeView(v: ViewMode) {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => setCurrency(data.business?.currency || 'USD'))
      .catch(() => setCurrency('USD'));
  }, []);

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === '') params.delete(key);
        else params.set(key, value);
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  useEffect(() => {
    const handle = setTimeout(() => {
      if (searchInput !== search) updateParams({ search: searchInput || null, page: '1' });
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setFormOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', '20');
    if (search) params.set('search', search);
    if (status !== 'all') params.set('status', status);

    fetch(`/api/customers?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load customers');
        return r.json();
      })
      .then(setResult)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [page, search, status]);

  useEffect(() => {
    load();
  }, [load]);

  function closeForm(saved: boolean) {
    setFormOpen(false);
    if (searchParams.get('new') === '1') updateParams({ new: null });
    if (saved) load();
  }

  const rows = result?.data ?? [];
  const pagination = result?.pagination;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Customers</h1>
          <p className="text-sm text-muted-foreground">Everyone you sell to.</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" />
          Add customer
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search customers..."
              className="pl-8"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <Select value={status} onValueChange={(v) => updateParams({ status: v === 'all' ? null : v, page: '1' })}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-1 rounded-md border border-border p-1">
          <Button
            variant={view === 'table' ? 'secondary' : 'ghost'}
            size="icon"
            onClick={() => changeView('table')}
            title="Table view"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={view === 'grid' ? 'secondary' : 'ghost'}
            size="icon"
            onClick={() => changeView('grid')}
            title="Grid view"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <CustomersSkeleton view={view} />
      ) : error ? (
        <ErrorState message="Could not load customers." onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search || status !== 'all' ? 'No customers match your filters' : 'No customers yet'}
          description={
            search || status !== 'all'
              ? 'Try a different search or clear the filters.'
              : 'Add your first customer to start tracking orders and invoices.'
          }
          action={
            !search && status === 'all' ? (
              <Button onClick={() => setFormOpen(true)}>
                <Plus className="h-4 w-4" />
                Add your first customer
              </Button>
            ) : undefined
          }
        />
      ) : view === 'table' ? (
        <>
          <Card className="hidden overflow-hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Business</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c._id}>
                    <TableCell>
                      <Link href={`/customers/${c._id}`} className="font-medium hover:underline">
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell>{c.businessName || '—'}</TableCell>
                    <TableCell>{c.email || '—'}</TableCell>
                    <TableCell>{c.phone || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === 'active' ? 'success' : 'outline'}>{c.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <div className="space-y-3 sm:hidden">
            {rows.map((c) => (
              <CustomerCard key={c._id} customer={c} />
            ))}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((c) => (
            <CustomerCard key={c._id} customer={c} />
          ))}
        </div>
      )}

      {pagination && pagination.totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages} &middot; {pagination.total} customers
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => updateParams({ page: String(page - 1) })}>
              <ChevronLeft className="h-4 w-4" />
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pagination.totalPages}
              onClick={() => updateParams({ page: String(page + 1) })}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}

      <CustomerFormDialog open={formOpen} onClose={closeForm} currency={currency} />
    </div>
  );
}

function CustomerCard({ customer }: { customer: Customer }) {
  return (
    <Link href={`/customers/${customer._id}`}>
      <Card className="p-4 transition-colors hover:bg-accent/40">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium">{customer.name}</p>
            {customer.businessName ? <p className="truncate text-xs text-muted-foreground">{customer.businessName}</p> : null}
          </div>
          <Badge variant={customer.status === 'active' ? 'success' : 'outline'}>{customer.status}</Badge>
        </div>
        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          {customer.email ? (
            <p className="flex items-center gap-1.5 truncate">
              <Mail className="h-3.5 w-3.5 shrink-0" /> {customer.email}
            </p>
          ) : null}
          {customer.phone ? (
            <p className="flex items-center gap-1.5 truncate">
              <Phone className="h-3.5 w-3.5 shrink-0" /> {customer.phone}
            </p>
          ) : null}
        </div>
      </Card>
    </Link>
  );
}

function CustomersSkeleton({ view }: { view: ViewMode }) {
  if (view === 'grid') {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }
  return (
    <Card className="p-4">
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </Card>
  );
}
