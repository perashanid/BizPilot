import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth';
import { ok, withErrorHandling } from '@/lib/api-helpers';
import { cancelSale } from '@/lib/sales';
import { recordAudit } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/db';

export const runtime = 'nodejs';

export const POST = withErrorHandling(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const sale = await cancelSale(session.businessId, session.userId, params.id);
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'cancel',
    entityType: COLLECTIONS.sales,
    entityId: params.id,
    after: sale,
  });
  return ok(sale);
});
