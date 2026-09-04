'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Plus, Search, Truck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { SupplierDialog } from './_components/supplier-dialog';
import type { Paginated, Supplier } from '@/lib/types';

function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);
  return debounced;
}

export default function SuppliersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '');
  const debouncedSearch = useDebouncedValue(searchInput);
  const status = searchParams.get('status') ?? 'all';
  const page = Number(searchParams.get('page') ?? '1');

  const [result, setResult] = useState<Paginated<Supplier> | null>(null);
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page || 1));
      params.set('limit', '20');
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (status !== 'all') params.set('status', status);
      const res = await fetch(`/api/suppliers?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Could not load suppliers.');
      setResult(data as Paginated<Supplier>);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load suppliers.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, status]);

  useEffect(() => {
    load();
  }, [load]);

  function handleSaved() {
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Suppliers</h1>
          <p className="text-sm text-muted-foreground">Manage the vendors you purchase inventory from.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Add supplier
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search suppliers..."
            className="pl-8"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={(v) => updateParams({ status: v === 'all' ? undefined : v, page: undefined })}>
          <SelectTrigger className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <SuppliersSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !result || result.data.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No suppliers yet"
          description="Add a supplier to start creating purchase orders."
          action={
            <Button onClick={() => setDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add supplier
            </Button>
          }
        />
      ) : (
        <>
          {/* Table on sm+ */}
          <Card className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.data.map((supplier) => (
                  <TableRow key={supplier._id} className="cursor-pointer">
                    <TableCell className="font-medium">
                      <Link href={`/suppliers/${supplier._id}`} className="hover:underline">
                        {supplier.name}
                      </Link>
                    </TableCell>
                    <TableCell>{supplier.contactPerson || '—'}</TableCell>
                    <TableCell>{supplier.email || '—'}</TableCell>
                    <TableCell>{supplier.phone || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={supplier.status === 'active' ? 'success' : 'outline'}>{supplier.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Stacked cards below sm */}
          <div className="space-y-3 sm:hidden">
            {result.data.map((supplier) => (
              <Link key={supplier._id} href={`/suppliers/${supplier._id}`}>
                <Card>
                  <CardContent className="space-y-1.5 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{supplier.name}</p>
                      <Badge variant={supplier.status === 'active' ? 'success' : 'outline'}>{supplier.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{supplier.contactPerson || 'No contact person'}</p>
                    <p className="text-xs text-muted-foreground">{supplier.email || supplier.phone || '—'}</p>
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

      <SupplierDialog open={dialogOpen} onOpenChange={setDialogOpen} onSaved={handleSaved} />
    </div>
  );
}

function SuppliersSkeleton() {
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
