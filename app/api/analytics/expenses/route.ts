import { NextRequest } from 'next/server';
import { requireSession, canViewFinancials, AuthError } from '@/lib/auth';
import { ok, withErrorHandling, ApiValidationError } from '@/lib/api-helpers';
import { getExpenseBreakdown } from '@/lib/financials';
import { materializeDueRecurringExpenses } from '@/lib/expenses';

export const runtime = 'nodejs';

function resolveRange(searchParams: URLSearchParams): { from: string; to: string } {
  const to = searchParams.get('to') ?? new Date().toISOString();
  const from = searchParams.get('from') ?? new Date(Date.now() - 30 * 86400000).toISOString();
  if (from > to) throw new ApiValidationError({ from: 'Start date must be before end date.' });
  return { from, to };
}

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSession();
  if (!canViewFinancials(session.role)) {
    throw new AuthError('You do not have permission to view financials.', 403, 'FORBIDDEN');
  }
  const { from, to } = resolveRange(req.nextUrl.searchParams);
  await materializeDueRecurringExpenses(session.businessId);
  const result = await getExpenseBreakdown(session.businessId, { from, to });
  return ok(result);
});
