import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth';
import { ok, withErrorHandling } from '@/lib/api-helpers';
import { sendInvoice, withDerivedStatus } from '@/lib/invoicing';
import { recordAudit } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/db';

export const runtime = 'nodejs';

export const POST = withErrorHandling(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const invoice = await sendInvoice(session.businessId, params.id);
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'send',
    entityType: COLLECTIONS.invoices,
    entityId: params.id,
    after: invoice,
  });
  return ok(withDerivedStatus(invoice));
});
