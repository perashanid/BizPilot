'use client';

import { useEffect, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { format } from 'date-fns';
import { LayoutGrid, List as ListIcon, ListChecks, Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type Paginated,
  type PublicUser,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from '@/lib/types';

const VIEW_STORAGE_KEY = 'sme-copilot:tasks:view';

const COLUMN_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

function statusBadgeVariant(status: TaskStatus): 'success' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'done') return 'success';
  if (status === 'in_progress') return 'secondary';
  if (status === 'blocked') return 'destructive';
  return 'outline';
}

function priorityBadgeVariant(priority: TaskPriority): 'outline' | 'secondary' | 'warning' | 'destructive' {
  if (priority === 'urgent') return 'destructive';
  if (priority === 'high') return 'warning';
  if (priority === 'medium') return 'secondary';
  return 'outline';
}

type EmptyColumns = Record<TaskStatus, Task[]>;
const EMPTY_COLUMNS: EmptyColumns = { todo: [], in_progress: [], blocked: [], done: [] };

export default function TasksPage() {
  const { toast } = useToast();

  const [me, setMe] = useState<PublicUser | null>(null);
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [viewHydrated, setViewHydrated] = useState(false);

  const [assigneeFilter, setAssigneeFilter] = useState<'all' | 'me'>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | TaskPriority>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');

  const [columns, setColumns] = useState<EmptyColumns>(EMPTY_COLUMNS);
  const [kanbanLoading, setKanbanLoading] = useState(true);
  const [kanbanError, setKanbanError] = useState<string | null>(null);
  const [quickAdd, setQuickAdd] = useState<Record<TaskStatus, string>>({ todo: '', in_progress: '', blocked: '', done: '' });
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);

  const [listData, setListData] = useState<Paginated<Task> | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [listPage, setListPage] = useState(1);
  const [sortField, setSortField] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [listQuickAdd, setListQuickAdd] = useState('');
  const [listQuickAddStatus, setListQuickAddStatus] = useState<TaskStatus>('todo');

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(VIEW_STORAGE_KEY) : null;
    if (stored === 'kanban' || stored === 'list') setView(stored);
    setViewHydrated(true);
  }, []);

  useEffect(() => {
    if (!viewHydrated) return;
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view, viewHydrated]);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((body: { user: PublicUser | null }) => {
        if (body.user) setMe(body.user);
      })
      .catch(() => undefined);
  }, []);

  // -------------------------------------------------------------------------
  // Kanban data
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (view !== 'kanban') return;
    let cancelled = false;
    setKanbanLoading(true);
    setKanbanError(null);

    const base = new URLSearchParams({ limit: '100', sort: 'createdAt', order: 'asc' });
    if (assigneeFilter === 'me' && me) base.set('assigneeId', me._id);
    if (priorityFilter !== 'all') base.set('priority', priorityFilter);

    Promise.all(
      TASK_STATUSES.map(async (status) => {
        const params = new URLSearchParams(base);
        params.set('status', status);
        const res = await fetch(`/api/tasks?${params.toString()}`);
        if (!res.ok) throw new Error('Could not load tasks.');
        return (await res.json()) as Paginated<Task>;
      })
    )
      .then((results) => {
        if (cancelled) return;
        const next = { ...EMPTY_COLUMNS };
        TASK_STATUSES.forEach((status, i) => {
          next[status] = results[i].data;
        });
        setColumns(next);
      })
      .catch((err) => {
        if (!cancelled) setKanbanError(err instanceof Error ? err.message : 'Could not load tasks.');
      })
      .finally(() => {
        if (!cancelled) setKanbanLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [view, assigneeFilter, priorityFilter, me, refreshKey]);

  // -------------------------------------------------------------------------
  // List data
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (view !== 'list') return;
    let cancelled = false;
    setListLoading(true);
    setListError(null);

    const params = new URLSearchParams({ page: String(listPage), limit: '20', sort: sortField, order: sortOrder });
    if (assigneeFilter === 'me' && me) params.set('assigneeId', me._id);
    if (priorityFilter !== 'all') params.set('priority', priorityFilter);
    if (statusFilter !== 'all') params.set('status', statusFilter);

    fetch(`/api/tasks?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Could not load tasks.');
        return (await res.json()) as Paginated<Task>;
      })
      .then((body) => {
        if (!cancelled) setListData(body);
      })
      .catch((err) => {
        if (!cancelled) setListError(err instanceof Error ? err.message : 'Could not load tasks.');
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [view, assigneeFilter, priorityFilter, statusFilter, listPage, sortField, sortOrder, me, refreshKey]);

  function toggleSort(field: string) {
    if (sortField === field) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  }

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------
  async function createTask(title: string, status: TaskStatus) {
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? 'Could not add this task.');
      }
      const task = (await res.json()) as Task;
      setColumns((cols) => ({ ...cols, [status]: [task, ...cols[status]] }));
      setListData((prev) => (prev ? { ...prev, data: [task, ...prev.data], pagination: { ...prev.pagination, total: prev.pagination.total + 1 } } : prev));
    } catch (err) {
      toast({ title: 'Could not add task', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    }
  }

  function handleQuickAddKeyDown(e: KeyboardEvent<HTMLInputElement>, status: TaskStatus) {
    if (e.key !== 'Enter') return;
    const title = quickAdd[status].trim();
    if (!title) return;
    setQuickAdd((q) => ({ ...q, [status]: '' }));
    createTask(title, status);
  }

  function handleListQuickAddKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    const title = listQuickAdd.trim();
    if (!title) return;
    setListQuickAdd('');
    createTask(title, listQuickAddStatus);
  }

  function handleDragStart(e: DragEvent<HTMLDivElement>, taskId: string) {
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDrop(e: DragEvent<HTMLDivElement>, newStatus: TaskStatus) {
    e.preventDefault();
    setDragOverStatus(null);
    const taskId = e.dataTransfer.getData('text/plain');
    if (!taskId) return;

    let found: Task | undefined;
    for (const status of TASK_STATUSES) {
      const match = columns[status].find((t) => t._id === taskId);
      if (match) {
        found = match;
        break;
      }
    }
    if (!found || found.status === newStatus) return;
    const task = found;
    const snapshot = columns;

    const next = { ...columns };
    next[task.status] = next[task.status].filter((t) => t._id !== taskId);
    next[newStatus] = [{ ...task, status: newStatus }, ...next[newStatus]];
    setColumns(next);

    fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Could not move this task.');
      })
      .catch(() => {
        setColumns(snapshot);
        toast({ title: 'Could not move task', description: 'The change was rolled back.', variant: 'destructive' });
      });
  }

  async function patchTask(taskId: string, patch: Record<string, unknown>): Promise<Task | null> {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? 'Could not save changes.');
      }
      return (await res.json()) as Task;
    } catch (err) {
      toast({ title: 'Could not save changes', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
      return null;
    }
  }

  function applyTaskUpdate(updated: Task) {
    setSelectedTask(updated);
    setColumns((cols) => ({
      ...cols,
      [updated.status]: cols[updated.status].map((t) => (t._id === updated._id ? updated : t)),
    }));
    setListData((prev) => (prev ? { ...prev, data: prev.data.map((t) => (t._id === updated._id ? updated : t)) } : prev));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Tasks</h1>
          <p className="text-sm text-muted-foreground">Track work across your team.</p>
        </div>
        <div className="flex rounded-md border border-border p-1">
          <Button
            variant={view === 'kanban' ? 'secondary' : 'ghost'}
            size="sm"
            className="gap-1.5"
            onClick={() => setView('kanban')}
          >
            <LayoutGrid className="h-4 w-4" /> Board
          </Button>
          <Button
            variant={view === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            className="gap-1.5"
            onClick={() => setView('list')}
          >
            <ListIcon className="h-4 w-4" /> List
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={assigneeFilter} onValueChange={(v) => setAssigneeFilter(v as 'all' | 'me')}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tasks</SelectItem>
            <SelectItem value="me">Assigned to me</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as 'all' | TaskPriority)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            {TASK_PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {view === 'list' ? (
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | TaskStatus)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {TASK_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {COLUMN_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {view === 'kanban' ? (
        kanbanLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TASK_STATUSES.map((s) => (
              <Skeleton key={s} className="h-72" />
            ))}
          </div>
        ) : kanbanError ? (
          <ErrorState message={kanbanError} onRetry={() => setRefreshKey((k) => k + 1)} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TASK_STATUSES.map((status) => (
              <div
                key={status}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverStatus !== status) setDragOverStatus(status);
                }}
                onDragLeave={() => setDragOverStatus((s) => (s === status ? null : s))}
                onDrop={(e) => handleDrop(e, status)}
                className={cn(
                  'flex min-h-[16rem] flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3 transition-colors',
                  dragOverStatus === status && 'border-primary bg-primary/5'
                )}
              >
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold">{COLUMN_LABELS[status]}</h2>
                  <span className="text-xs text-muted-foreground">{columns[status].length}</span>
                </div>
                <Input
                  placeholder="Quick add..."
                  value={quickAdd[status]}
                  onChange={(e) => setQuickAdd((q) => ({ ...q, [status]: e.target.value }))}
                  onKeyDown={(e) => handleQuickAddKeyDown(e, status)}
                  className="h-8 bg-background text-sm"
                />
                <div className="flex flex-col gap-2">
                  {columns[status].length === 0 ? (
                    <p className="px-1 py-4 text-center text-xs text-muted-foreground">No tasks</p>
                  ) : (
                    columns[status].map((task) => (
                      <div
                        key={task._id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, task._id)}
                        onClick={() => setSelectedTask(task)}
                        className="cursor-pointer rounded-md border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md"
                      >
                        <p className="text-sm font-medium leading-snug">{task.title}</p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <Badge variant={priorityBadgeVariant(task.priority)}>{PRIORITY_LABELS[task.priority]}</Badge>
                          {task.dueDate ? (
                            <span className="font-mono text-xs tabular-nums text-muted-foreground">
                              {format(new Date(task.dueDate), 'MMM d, yyyy')}
                            </span>
                          ) : null}
                        </div>
                        {task.subtasks.length > 0 ? (
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            {task.subtasks.filter((s) => s.done).length}/{task.subtasks.length} subtasks
                          </p>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={listQuickAddStatus} onValueChange={(v) => setListQuickAddStatus(v as TaskStatus)}>
                <SelectTrigger className="sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {COLUMN_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Quick add a task and press Enter..."
                value={listQuickAdd}
                onChange={(e) => setListQuickAdd(e.target.value)}
                onKeyDown={handleListQuickAddKeyDown}
              />
            </div>

            {listLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : listError ? (
              <ErrorState message={listError} onRetry={() => setRefreshKey((k) => k + 1)} />
            ) : !listData || listData.data.length === 0 ? (
              <EmptyState icon={ListChecks} title="No tasks found" description="Try a different filter, or add one above." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHead field="title" current={sortField} order={sortOrder} onClick={toggleSort}>
                        Title
                      </SortableHead>
                      <SortableHead field="status" current={sortField} order={sortOrder} onClick={toggleSort}>
                        Status
                      </SortableHead>
                      <SortableHead field="priority" current={sortField} order={sortOrder} onClick={toggleSort}>
                        Priority
                      </SortableHead>
                      <SortableHead field="dueDate" current={sortField} order={sortOrder} onClick={toggleSort}>
                        Due date
                      </SortableHead>
                      <TableHead>Assignee</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {listData.data.map((task) => (
                      <TableRow key={task._id} className="cursor-pointer" onClick={() => setSelectedTask(task)}>
                        <TableCell className="font-medium">{task.title}</TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(task.status)}>{COLUMN_LABELS[task.status]}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={priorityBadgeVariant(task.priority)}>{PRIORITY_LABELS[task.priority]}</Badge>
                        </TableCell>
                        <TableCell className="font-mono tabular-nums">
                          {task.dueDate ? format(new Date(task.dueDate), 'MMM d, yyyy') : '—'}
                        </TableCell>
                        <TableCell>{task.assigneeId ? (task.assigneeId === me?._id ? 'You' : 'Assigned') : 'Unassigned'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {listData && listData.pagination.totalPages > 1 ? (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Page {listData.pagination.page} of {listData.pagination.totalPages} &middot; {listData.pagination.total} tasks
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={listPage <= 1} onClick={() => setListPage((p) => Math.max(1, p - 1))}>
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={listPage >= listData.pagination.totalPages}
                    onClick={() => setListPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      <TaskDrawer
        task={selectedTask}
        currentUserId={me?._id ?? null}
        onClose={() => setSelectedTask(null)}
        onPatch={patchTask}
        onUpdated={applyTaskUpdate}
      />
    </div>
  );
}

function SortableHead({
  field,
  current,
  order,
  onClick,
  children,
}: {
  field: string;
  current: string;
  order: 'asc' | 'desc';
  onClick: (field: string) => void;
  children: ReactNode;
}) {
  const active = current === field;
  return (
    <TableHead className="cursor-pointer select-none" onClick={() => onClick(field)}>
      <span className={cn('inline-flex items-center gap-1', active && 'text-foreground')}>
        {children}
        {active ? <span aria-hidden>{order === 'asc' ? '▲' : '▼'}</span> : null}
      </span>
    </TableHead>
  );
}

// ---------------------------------------------------------------------------
// Task detail drawer
// ---------------------------------------------------------------------------

interface TaskDrawerProps {
  task: Task | null;
  currentUserId: string | null;
  onClose: () => void;
  onPatch: (taskId: string, patch: Record<string, unknown>) => Promise<Task | null>;
  onUpdated: (task: Task) => void;
}

function TaskDrawer({ task, currentUserId, onClose, onPatch, onUpdated }: TaskDrawerProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [newSubtask, setNewSubtask] = useState('');
  const [newComment, setNewComment] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? '');
    }
  }, [task]);

  if (!task) return null;

  async function saveField(patch: Record<string, unknown>) {
    if (!task) return;
    setBusy(true);
    const updated = await onPatch(task._id, patch);
    setBusy(false);
    if (updated) onUpdated(updated);
  }

  async function toggleSubtask(id: string) {
    if (!task) return;
    const next = task.subtasks.map((s) => (s.id === id ? { ...s, done: !s.done } : s));
    await saveField({ subtasks: next });
  }

  async function removeSubtask(id: string) {
    if (!task) return;
    const next = task.subtasks.filter((s) => s.id !== id);
    await saveField({ subtasks: next });
  }

  async function addSubtask() {
    if (!task || !newSubtask.trim()) return;
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`;
    const next = [...task.subtasks, { id, title: newSubtask.trim(), done: false }];
    setNewSubtask('');
    await saveField({ subtasks: next });
  }

  async function addComment() {
    if (!task || !newComment.trim()) return;
    const text = newComment.trim();
    setNewComment('');
    await saveField({ newComment: text });
  }

  return (
    <Dialog open={Boolean(task)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">Task details</DialogTitle>
          <DialogDescription className="sr-only">View and edit task details, subtasks, and comments.</DialogDescription>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== task.title && saveField({ title: title.trim() })}
            className="border-none px-0 text-lg font-display font-semibold shadow-none focus-visible:ring-0"
            aria-label="Task title"
          />
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={task.priority} onValueChange={(v) => saveField({ priority: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Due date</Label>
              <Input
                type="date"
                defaultValue={task.dueDate ? task.dueDate.slice(0, 10) : ''}
                onChange={(e) => saveField({ dueDate: e.target.value || undefined })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => description !== (task.description ?? '') && saveField({ description })}
              rows={3}
              placeholder="No description"
            />
          </div>

          <div className="space-y-2">
            <Label>Subtasks</Label>
            <div className="space-y-1.5">
              {task.subtasks.map((subtask) => (
                <div key={subtask.id} className="flex items-center gap-2">
                  <Checkbox checked={subtask.done} onCheckedChange={() => toggleSubtask(subtask.id)} disabled={busy} />
                  <span className={cn('flex-1 text-sm', subtask.done && 'text-muted-foreground line-through')}>
                    {subtask.title}
                  </span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeSubtask(subtask.id)} disabled={busy}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Add a subtask..."
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addSubtask()}
              />
              <Button type="button" variant="outline" size="icon" onClick={addSubtask} disabled={busy || !newSubtask.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Comments</Label>
            <div className="space-y-2">
              {task.comments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No comments yet.</p>
              ) : (
                task.comments.map((comment) => (
                  <div key={comment.id} className="rounded-md bg-muted p-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{comment.userId === currentUserId ? 'You' : 'Team member'}</span>
                      <span className="text-xs text-muted-foreground">{format(new Date(comment.createdAt), 'MMM d, yyyy')}</span>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap">{comment.text}</p>
                  </div>
                ))
              )}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Add a comment..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addComment()}
              />
              <Button type="button" variant="outline" onClick={addComment} disabled={busy || !newComment.trim()}>
                Post
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
