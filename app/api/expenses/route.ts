import { NextRequest } from 'next/server';
import { requireSession, AuthError, canEditFinancials } from '@/lib/auth';
import { parseJson, parseQuery, ok, withErrorHandling } from '@/lib/api-helpers';
import { listDocs, insertDoc } from '@/lib/repo';
import { materializeDueRecurringExpenses } from '@/lib/expenses';
import { recordAudit } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/db';
import { zExpenseInput, type Expense } from '@/lib/types';

export const runtime = 'nodejs';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSession();
  // Generates any recurring-expense occurrences that have come due before we list/search, so
  // the list always reflects up-to-date recurring occurrences with no cron job required.
  await materializeDueRecurringExpenses(session.businessId);

  const query = parseQuery(req.nextUrl.searchParams);
  const category = req.nextUrl.searchParams.get('category') || undefined;
  const from = req.nextUrl.searchParams.get('from') || undefined;
  const to = req.nextUrl.searchParams.get('to') || undefined;

  const extraFilter: Record<string, unknown> = {};
  if (category) extraFilter.category = category;
  if (from || to) {
    extraFilter.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  }

  const result = await listDocs<Expense>(COLLECTIONS.expenses, {
    businessId: session.businessId,
    ...query,
    searchFields: ['category', 'vendor', 'notes'],
    extraFilter,
  });
  return ok(result);
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSession();
  if (!canEditFinancials(session.role)) {
    throw new AuthError('You do not have permission to record expenses.', 403, 'FORBIDDEN');
  }
  const input = await parseJson(req, zExpenseInput);
  const expense = await insertDoc<Expense>(COLLECTIONS.expenses, session.businessId, {
    ...input,
    approvalStatus: 'approved',
  });
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'create',
    entityType: COLLECTIONS.expenses,
    entityId: expense._id,
    after: expense,
  });
  return ok(expense, 201);
});
