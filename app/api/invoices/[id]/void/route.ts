import { NextRequest } from 'next/server';
import { requireSession, AuthError, canEditFinancials } from '@/lib/auth';
import { ok, withErrorHandling } from '@/lib/api-helpers';
import { voidInvoice, withDerivedStatus } from '@/lib/invoicing';
import { recordAudit } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/db';

export const runtime = 'nodejs';

export const POST = withErrorHandling(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  if (!canEditFinancials(session.role)) {
    throw new AuthError('You do not have permission to void invoices.', 403, 'FORBIDDEN');
  }
  const invoice = await voidInvoice(session.businessId, params.id);
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'void',
    entityType: COLLECTIONS.invoices,
    entityId: params.id,
    after: invoice,
  });
  return ok(withDerivedStatus(invoice));
});
