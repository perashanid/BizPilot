import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { parseJson, ok, withErrorHandling } from '@/lib/api-helpers';
import { getDocOr404, updateDocById, deleteDocById } from '@/lib/repo';
import { recordAudit } from '@/lib/audit';
import { newId } from '@/lib/id';
import { COLLECTIONS } from '@/lib/db';
import { zTaskInput, type Task } from '@/lib/types';

export const runtime = 'nodejs';

const zTaskPatchInput = z.object({
  ...zTaskInput.partial().shape,
  newComment: z.string().trim().min(1).max(2000).optional(),
});

export const GET = withErrorHandling(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const task = await getDocOr404<Task>(COLLECTIONS.tasks, session.businessId, params.id, 'Task');
  return ok(task);
});

export const PATCH = withErrorHandling(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const before = await getDocOr404<Task>(COLLECTIONS.tasks, session.businessId, params.id, 'Task');

  const input = await parseJson(req, zTaskPatchInput);
  const { newComment, ...patch } = input;

  const finalPatch: Partial<Task> = { ...patch };
  if (newComment) {
    finalPatch.comments = [
      ...before.comments,
      { id: newId(), userId: session.userId, text: newComment, createdAt: new Date().toISOString() },
    ];
  }

  const after = await updateDocById<Task>(COLLECTIONS.tasks, session.businessId, params.id, finalPatch, 'Task');
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'update',
    entityType: COLLECTIONS.tasks,
    entityId: params.id,
    before,
    after,
  });
  return ok(after);
});

export const DELETE = withErrorHandling(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const before = await getDocOr404<Task>(COLLECTIONS.tasks, session.businessId, params.id, 'Task');
  await deleteDocById(COLLECTIONS.tasks, session.businessId, params.id, 'Task');
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'delete',
    entityType: COLLECTIONS.tasks,
    entityId: params.id,
    before,
  });
  return ok({ success: true });
});
