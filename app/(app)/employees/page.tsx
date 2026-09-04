'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { Plus, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useToast } from '@/components/ui/use-toast';
import { formatMoney, toMinorUnits } from '@/lib/money';
import type { Business, Employee, Paginated, PublicUser } from '@/lib/types';

// lib/auth.ts's canViewPayroll / the ['owner','manager'] role check enforced by
// app/api/employees/route.ts (POST) and app/api/employees/[id]/route.ts (PATCH/DELETE) are
// server-only (lib/auth.ts imports bcryptjs/jose/next/headers, which can't run in a client
// component). These mirror that exact logic so the UI never shows an action that would 403 —
// keep in sync with lib/auth.ts if those role rules change.
function canViewPayrollClient(role: string): boolean {
  return role === 'owner' || role === 'manager';
}
function canManageEmployeesClient(role: string): boolean {
  return role === 'owner' || role === 'manager';
}

const EMPLOYMENT_TYPES: { value: Employee['employmentType']; label: string }[] = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
];
const PAY_FREQUENCIES: { value: Employee['payFrequency']; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
];
const STATUSES: { value: Employee['status']; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'on_leave', label: 'On leave' },
  { value: 'terminated', label: 'Terminated' },
];

function statusBadgeVariant(status: string): 'success' | 'secondary' | 'destructive' {
  if (status === 'active') return 'success';
  if (status === 'on_leave') return 'secondary';
  return 'destructive';
}

interface FormState {
  name: string;
  email: string;
  phone: string;
  role: string;
  department: string;
  employmentType: Employee['employmentType'];
  salary: string;
  payFrequency: Employee['payFrequency'];
  startDate: string;
  status: Employee['status'];
}

const EMPTY_FORM: FormState = {
  name: '',
  email: '',
  phone: '',
  role: '',
  department: '',
  employmentType: 'full_time',
  salary: '',
  payFrequency: 'monthly',
  startDate: format(new Date(), 'yyyy-MM-dd'),
  status: 'active',
};

export default function EmployeesPage() {
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [me, setMe] = useState<{ user: PublicUser; business: Business } | null>(null);
  const [data, setData] = useState<Paginated<Employee> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (searchParams.get('new') === '1') setDialogOpen(true);
    // Only react to the initial query param, not every searchParams identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((body: { user: PublicUser | null; business: Business | null }) => {
        if (body.user && body.business) setMe({ user: body.user, business: body.business });
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (search) params.set('search', search);
    if (statusFilter !== 'all') params.set('status', statusFilter);

    fetch(`/api/employees?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error?.message ?? 'Could not load employees.');
        }
        return res.json() as Promise<Paginated<Employee>>;
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load employees.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [search, statusFilter, page, refreshKey]);

  const role = me?.user.role ?? 'staff';
  const canManage = canManageEmployeesClient(role);
  const canSeePay = canViewPayrollClient(role);
  const currency = me?.business.currency ?? 'USD';

  function openCreateDialog() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.role.trim() || !form.startDate) {
      setFormError('Name, role, and start date are required.');
      return;
    }
    setSaving(true);
    setFormError(null);

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      role: form.role.trim(),
      startDate: form.startDate,
      employmentType: form.employmentType,
      payFrequency: form.payFrequency,
      status: form.status,
    };
    if (form.email.trim()) payload.email = form.email.trim();
    if (form.phone.trim()) payload.phone = form.phone.trim();
    if (form.department.trim()) payload.department = form.department.trim();
    if (canSeePay && form.salary.trim()) payload.salary = toMinorUnits(form.salary, currency);

    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? 'Could not add this employee.');
      }
      setDialogOpen(false);
      setRefreshKey((k) => k + 1);
      toast({ title: 'Employee added', variant: 'success' });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not add this employee.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Employees</h1>
          <p className="text-sm text-muted-foreground">Manage your team&rsquo;s roles, departments, and status.</p>
        </div>
        {canManage ? (
          <Button onClick={openCreateDialog} className="gap-2">
            <Plus className="h-4 w-4" /> Add employee
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder="Search by name, email, role, or department..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="sm:max-w-sm"
          aria-label="Search employees"
        />
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : error ? (
        <ErrorState message={error} onRetry={() => setRefreshKey((k) => k + 1)} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No employees found"
          description={
            search || statusFilter !== 'all'
              ? 'Try a different search term or filter.'
              : 'Add your first employee to start tracking your team.'
          }
          action={
            canManage && !search && statusFilter === 'all' ? (
              <Button onClick={openCreateDialog} className="gap-2">
                <Plus className="h-4 w-4" /> Add employee
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Employment type</TableHead>
                  {canSeePay ? <TableHead className="text-right">Salary</TableHead> : null}
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((employee) => (
                  <TableRow key={employee._id} className="cursor-pointer">
                    <TableCell>
                      <Link href={`/employees/${employee._id}`} className="font-medium hover:underline">
                        {employee.name}
                      </Link>
                      {employee.email ? (
                        <p className="text-xs text-muted-foreground">{employee.email}</p>
                      ) : null}
                    </TableCell>
                    <TableCell>{employee.role}</TableCell>
                    <TableCell>{employee.department || '—'}</TableCell>
                    <TableCell>
                      {EMPLOYMENT_TYPES.find((t) => t.value === employee.employmentType)?.label ??
                        employee.employmentType}
                    </TableCell>
                    {canSeePay ? (
                      <TableCell className="text-right font-mono tabular-nums">
                        {typeof employee.salary === 'number' ? formatMoney(employee.salary, currency) : '—'}
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <Badge variant={statusBadgeVariant(employee.status)}>
                        {STATUSES.find((s) => s.value === employee.status)?.label ?? employee.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {data && data.pagination.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {data.pagination.page} of {data.pagination.totalPages} &middot; {data.pagination.total} employees
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add employee</DialogTitle>
            <DialogDescription>Create a new employee record for your business.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="emp-name">Name</Label>
                <Input
                  id="emp-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-role">Role / title</Label>
                <Input
                  id="emp-role"
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-email">Email</Label>
                <Input
                  id="emp-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-phone">Phone</Label>
                <Input
                  id="emp-phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-department">Department</Label>
                <Input
                  id="emp-department"
                  value={form.department}
                  onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Employment type</Label>
                <Select
                  value={form.employmentType}
                  onValueChange={(v) => setForm((f) => ({ ...f, employmentType: v as Employee['employmentType'] }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EMPLOYMENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Pay frequency</Label>
                <Select
                  value={form.payFrequency}
                  onValueChange={(v) => setForm((f) => ({ ...f, payFrequency: v as Employee['payFrequency'] }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAY_FREQUENCIES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {canSeePay ? (
                <div className="space-y-1.5">
                  <Label htmlFor="emp-salary">Salary ({currency})</Label>
                  <Input
                    id="emp-salary"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.salary}
                    onChange={(e) => setForm((f) => ({ ...f, salary: e.target.value }))}
                  />
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="emp-start">Start date</Label>
                <Input
                  id="emp-start"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as Employee['status'] }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Add employee'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
