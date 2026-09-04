import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth';
import { parseJson, parseQuery, ok, withErrorHandling } from '@/lib/api-helpers';
import { listDocs, insertDoc } from '@/lib/repo';
import { recordAudit } from '@/lib/audit';
import { newId } from '@/lib/id';
import { COLLECTIONS } from '@/lib/db';
import { zTaskInput, type Task } from '@/lib/types';

export const runtime = 'nodejs';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSession();
  const query = parseQuery(req.nextUrl.searchParams);
  const status = req.nextUrl.searchParams.get('status') || undefined;
  const assigneeId = req.nextUrl.searchParams.get('assigneeId') || undefined;
  const priority = req.nextUrl.searchParams.get('priority') || undefined;
  const extraFilter: Record<string, unknown> = {};
  if (status) extraFilter.status = status;
  if (assigneeId) extraFilter.assigneeId = assigneeId;
  if (priority) extraFilter.priority = priority;

  const result = await listDocs<Task>(COLLECTIONS.tasks, {
    businessId: session.businessId,
    ...query,
    searchFields: ['title', 'description'],
    extraFilter,
  });
  return ok(result);
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSession();
  const input = await parseJson(req, zTaskInput);
  const subtasks = input.subtasks.map((s) => (s.id ? s : { ...s, id: newId() }));
  const task = await insertDoc<Task>(COLLECTIONS.tasks, session.businessId, {
    ...input,
    subtasks,
    comments: [],
    createdBy: session.userId,
  });
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'create',
    entityType: COLLECTIONS.tasks,
    entityId: task._id,
    after: task,
  });
  return ok(task, 201);
});
