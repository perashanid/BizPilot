'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeft, ListChecks } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useToast } from '@/components/ui/use-toast';
import { formatMoney, toMinorUnits, toMajorUnits } from '@/lib/money';
import type { Business, Employee, Paginated, PublicUser, Task } from '@/lib/types';

// Mirrors lib/auth.ts's canViewPayroll / the ['owner','manager'] role checks server-enforced by
// app/api/employees/[id]/route.ts. See app/(app)/employees/page.tsx for the same note.
function canViewPayrollClient(role: string): boolean {
  return role === 'owner' || role === 'manager';
}
function canManageEmployeesClient(role: string): boolean {
  return role === 'owner' || role === 'manager';
}

/**
 * Illustrative-only permission strings. This app's real authorization is role-based
 * (see lib/auth.ts's canViewFinancials/canManageInventory/canManageUsers/canViewPayroll,
 * keyed off Employee.role via the linked User's Role). The `permissions: string[]` field on
 * Employee has no effect on what an employee's linked login can actually do anywhere else in
 * the app — this checklist just lets you record intent/notes against an employee record.
 */
const PERMISSION_OPTIONS = [
  { key: 'view_financials', label: 'View financials' },
  { key: 'manage_inventory', label: 'Manage inventory' },
  { key: 'manage_users', label: 'Manage users' },
];

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

function taskStatusBadgeVariant(status: string): 'success' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'done') return 'success';
  if (status === 'in_progress') return 'secondary';
  if (status === 'blocked') return 'destructive';
  return 'outline';
}

interface EditFormState {
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

export default function EmployeeDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();

  const [me, setMe] = useState<{ user: PublicUser; business: Business } | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [tasksLoading, setTasksLoading] = useState(false);

  const [permissions, setPermissions] = useState<string[]>([]);
  const [savingPermissions, setSavingPermissions] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [terminateOpen, setTerminateOpen] = useState(false);
  const [terminating, setTerminating] = useState(false);

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
    fetch(`/api/employees/${params.id}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error?.message ?? 'Could not load this employee.');
        }
        return res.json() as Promise<Employee>;
      })
      .then((body) => {
        if (cancelled) return;
        setEmployee(body);
        setPermissions(body.permissions ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load this employee.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.id, refreshKey]);

  useEffect(() => {
    if (!employee?.linkedUserId) {
      setTasks(null);
      return;
    }
    let cancelled = false;
    setTasksLoading(true);
    fetch(`/api/tasks?assigneeId=${encodeURIComponent(employee.linkedUserId)}&limit=50`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Could not load tasks.');
        return res.json() as Promise<Paginated<Task>>;
      })
      .then((body) => {
        if (!cancelled) setTasks(body.data);
      })
      .catch(() => {
        if (!cancelled) setTasks([]);
      })
      .finally(() => {
        if (!cancelled) setTasksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [employee?.linkedUserId]);

  const role = me?.user.role ?? 'staff';
  const canManage = canManageEmployeesClient(role);
  const canSeePay = canViewPayrollClient(role);
  const currency = me?.business.currency ?? 'USD';

  function openEditDialog() {
    if (!employee) return;
    setEditForm({
      name: employee.name,
      email: employee.email ?? '',
      phone: employee.phone ?? '',
      role: employee.role,
      department: employee.department ?? '',
      employmentType: employee.employmentType,
      salary: typeof employee.salary === 'number' ? String(toMajorUnits(employee.salary, currency)) : '',
      payFrequency: employee.payFrequency,
      startDate: employee.startDate.slice(0, 10),
      status: employee.status,
    });
    setFormError(null);
    setEditOpen(true);
  }

  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editForm) return;
    setSaving(true);
    setFormError(null);

    const payload: Record<string, unknown> = {
      name: editForm.name.trim(),
      role: editForm.role.trim(),
      startDate: editForm.startDate,
      employmentType: editForm.employmentType,
      payFrequency: editForm.payFrequency,
      status: editForm.status,
      email: editForm.email.trim(),
      phone: editForm.phone.trim(),
      department: editForm.department.trim(),
    };
    if (canSeePay) {
      payload.salary = editForm.salary.trim() ? toMinorUnits(editForm.salary, currency) : 0;
    }

    try {
      const res = await fetch(`/api/employees/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? 'Could not save changes.');
      }
      setEditOpen(false);
      setRefreshKey((k) => k + 1);
      toast({ title: 'Employee updated', variant: 'success' });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  }

  async function handleTogglePermission(key: string, checked: boolean) {
    const prev = permissions;
    const next = checked ? [...prev, key] : prev.filter((p) => p !== key);
    setPermissions(next);
    setSavingPermissions(true);
    try {
      const res = await fetch(`/api/employees/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? 'Could not save permissions.');
      }
    } catch (err) {
      setPermissions(prev);
      toast({
        title: 'Could not save permissions',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSavingPermissions(false);
    }
  }

  async function handleTerminate() {
    setTerminating(true);
    try {
      const res = await fetch(`/api/employees/${params.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? 'Could not mark this employee terminated.');
      }
      setTerminateOpen(false);
      setRefreshKey((k) => k + 1);
      toast({ title: 'Employee marked terminated', variant: 'success' });
    } catch (err) {
      toast({
        title: 'Could not complete this action',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setTerminating(false);
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/employees" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to employees
      </Link>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={() => setRefreshKey((k) => k + 1)} />
      ) : !employee ? (
        <EmptyState title="Employee not found" description="This employee may have been removed." />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="font-display text-2xl font-semibold">{employee.name}</h1>
                <Badge variant={statusBadgeVariant(employee.status)}>
                  {STATUSES.find((s) => s.value === employee.status)?.label ?? employee.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {employee.role}
                {employee.department ? ` · ${employee.department}` : ''}
              </p>
            </div>
            {canManage ? (
              <div className="flex gap-2">
                <Button variant="outline" onClick={openEditDialog}>
                  Edit
                </Button>
                {employee.status !== 'terminated' ? (
                  <Button variant="destructive" onClick={() => setTerminateOpen(true)}>
                    Mark terminated
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Contact &amp; employment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <DetailRow label="Email" value={employee.email || '—'} />
                <DetailRow label="Phone" value={employee.phone || '—'} />
                <DetailRow
                  label="Employment type"
                  value={EMPLOYMENT_TYPES.find((t) => t.value === employee.employmentType)?.label ?? employee.employmentType}
                />
                <DetailRow
                  label="Pay frequency"
                  value={PAY_FREQUENCIES.find((f) => f.value === employee.payFrequency)?.label ?? employee.payFrequency}
                />
                {canSeePay ? (
                  <DetailRow
                    label="Salary"
                    value={typeof employee.salary === 'number' ? formatMoney(employee.salary, currency) : '—'}
                    mono
                  />
                ) : null}
                <DetailRow label="Start date" value={format(new Date(employee.startDate), 'MMM d, yyyy')} mono />
                <DetailRow label="Linked login" value={employee.linkedUserId ? 'Linked' : 'Not linked to a login'} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Permissions</CardTitle>
                <CardDescription>
                  Illustrative only — the app&rsquo;s real authorization is role-based (see lib/auth.ts), not these
                  free-form strings. Use this list to record intent for this employee.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {PERMISSION_OPTIONS.map((opt) => (
                  <div key={opt.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`perm-${opt.key}`}
                      checked={permissions.includes(opt.key)}
                      disabled={!canManage || savingPermissions}
                      onCheckedChange={(checked) => handleTogglePermission(opt.key, checked === true)}
                    />
                    <Label htmlFor={`perm-${opt.key}`} className="font-normal">
                      {opt.label}
                    </Label>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Assigned tasks</CardTitle>
              <CardDescription>Tasks assigned to this employee&rsquo;s linked login.</CardDescription>
            </CardHeader>
            <CardContent>
              {!employee.linkedUserId ? (
                <p className="text-sm text-muted-foreground">Not linked to a login.</p>
              ) : tasksLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : !tasks || tasks.length === 0 ? (
                <EmptyState icon={ListChecks} title="No tasks assigned" description="Tasks assigned to this employee will show up here." />
              ) : (
                <ul className="space-y-2">
                  {tasks.map((task) => (
                    <li key={task._id} className="flex items-center justify-between gap-2 rounded-md border border-border p-3 text-sm">
                      <Link href="/tasks" className="min-w-0 truncate font-medium hover:underline">
                        {task.title}
                      </Link>
                      <Badge variant={taskStatusBadgeVariant(task.status)}>{task.status.replace('_', ' ')}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit employee</DialogTitle>
            <DialogDescription>Update this employee&rsquo;s details.</DialogDescription>
          </DialogHeader>
          {editForm ? (
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-name">Name</Label>
                  <Input
                    id="edit-name"
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => (f ? { ...f, name: e.target.value } : f))}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-role">Role / title</Label>
                  <Input
                    id="edit-role"
                    value={editForm.role}
                    onChange={(e) => setEditForm((f) => (f ? { ...f, role: e.target.value } : f))}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-email">Email</Label>
                  <Input
                    id="edit-email"
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm((f) => (f ? { ...f, email: e.target.value } : f))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-phone">Phone</Label>
                  <Input
                    id="edit-phone"
                    value={editForm.phone}
                    onChange={(e) => setEditForm((f) => (f ? { ...f, phone: e.target.value } : f))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-department">Department</Label>
                  <Input
                    id="edit-department"
                    value={editForm.department}
                    onChange={(e) => setEditForm((f) => (f ? { ...f, department: e.target.value } : f))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Employment type</Label>
                  <Select
                    value={editForm.employmentType}
                    onValueChange={(v) => setEditForm((f) => (f ? { ...f, employmentType: v as Employee['employmentType'] } : f))}
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
                    value={editForm.payFrequency}
                    onValueChange={(v) => setEditForm((f) => (f ? { ...f, payFrequency: v as Employee['payFrequency'] } : f))}
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
                    <Label htmlFor="edit-salary">Salary ({currency})</Label>
                    <Input
                      id="edit-salary"
                      type="number"
                      min="0"
                      step="0.01"
                      value={editForm.salary}
                      onChange={(e) => setEditForm((f) => (f ? { ...f, salary: e.target.value } : f))}
                    />
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <Label htmlFor="edit-start">Start date</Label>
                  <Input
                    id="edit-start"
                    type="date"
                    value={editForm.startDate}
                    onChange={(e) => setEditForm((f) => (f ? { ...f, startDate: e.target.value } : f))}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={editForm.status} onValueChange={(v) => setEditForm((f) => (f ? { ...f, status: v as Employee['status'] } : f))}>
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
                <Button type="button" variant="secondary" onClick={() => setEditOpen(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save changes'}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={terminateOpen} onOpenChange={setTerminateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark employee terminated?</DialogTitle>
            <DialogDescription>
              This sets {employee?.name}&rsquo;s status to terminated. Their record is kept for history, not deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setTerminateOpen(false)} disabled={terminating}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleTerminate} disabled={terminating}>
              {terminating ? 'Working...' : 'Mark terminated'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? 'font-mono tabular-nums' : ''}>{value}</span>
    </div>
  );
}
