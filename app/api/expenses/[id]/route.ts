import { NextRequest } from 'next/server';
import { requireSession, AuthError, canEditFinancials } from '@/lib/auth';
import { parseJson, ok, withErrorHandling } from '@/lib/api-helpers';
import { getDocOr404, updateDocById, deleteDocById } from '@/lib/repo';
import { recordAudit } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/db';
import { zExpenseInput, type Expense } from '@/lib/types';

export const runtime = 'nodejs';

export const GET = withErrorHandling(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const expense = await getDocOr404<Expense>(COLLECTIONS.expenses, session.businessId, params.id, 'Expense');
  return ok(expense);
});

export const PATCH = withErrorHandling(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  if (!canEditFinancials(session.role)) {
    throw new AuthError('You do not have permission to edit expenses.', 403, 'FORBIDDEN');
  }
  const before = await getDocOr404<Expense>(COLLECTIONS.expenses, session.businessId, params.id, 'Expense');
  const input = await parseJson(req, zExpenseInput.partial());
  const after = await updateDocById<Expense>(COLLECTIONS.expenses, session.businessId, params.id, input, 'Expense');
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'update',
    entityType: COLLECTIONS.expenses,
    entityId: params.id,
    before,
    after,
  });
  return ok(after);
});

export const DELETE = withErrorHandling(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  if (!canEditFinancials(session.role)) {
    throw new AuthError('You do not have permission to delete expenses.', 403, 'FORBIDDEN');
  }
  const before = await getDocOr404<Expense>(COLLECTIONS.expenses, session.businessId, params.id, 'Expense');
  await deleteDocById(COLLECTIONS.expenses, session.businessId, params.id, 'Expense');
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'delete',
    entityType: COLLECTIONS.expenses,
    entityId: params.id,
    before,
  });
  return ok({ success: true });
});
