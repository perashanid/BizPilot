import { NextRequest } from 'next/server';
import { requireSession, AuthError, canEditFinancials } from '@/lib/auth';
import { parseJson, parseQuery, ok, withErrorHandling } from '@/lib/api-helpers';
import { listDocs } from '@/lib/repo';
import { recordPayment } from '@/lib/payments';
import { recordAudit } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/db';
import { zPaymentInput, type Payment } from '@/lib/types';

export const runtime = 'nodejs';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSession();
  const query = parseQuery(req.nextUrl.searchParams);
  const direction = req.nextUrl.searchParams.get('direction');
  const extraFilter: Record<string, unknown> = {};
  if (direction === 'in' || direction === 'out') extraFilter.direction = direction;

  const result = await listDocs<Payment>(COLLECTIONS.payments, {
    businessId: session.businessId,
    ...query,
    searchFields: ['reference', 'notes'],
    extraFilter,
  });
  return ok(result);
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSession();
  if (!canEditFinancials(session.role)) {
    throw new AuthError('You do not have permission to record payments.', 403, 'FORBIDDEN');
  }
  const input = await parseJson(req, zPaymentInput);
  const payment = await recordPayment(session.businessId, session.userId, input);
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'create',
    entityType: COLLECTIONS.payments,
    entityId: payment._id,
    after: payment,
  });
  return ok(payment, 201);
});
