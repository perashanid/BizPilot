import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth';
import { ok, withErrorHandling } from '@/lib/api-helpers';
import { cancelPurchaseOrder } from '@/lib/purchasing';
import { recordAudit } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/db';

export const runtime = 'nodejs';

export const POST = withErrorHandling(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const po = await cancelPurchaseOrder(session.businessId, params.id);
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'cancel',
    entityType: COLLECTIONS.purchaseOrders,
    entityId: params.id,
    after: po,
  });
  return ok(po);
});
