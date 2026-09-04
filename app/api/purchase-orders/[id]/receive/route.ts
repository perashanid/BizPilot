import { NextRequest } from 'next/server';
import { requireSession, AuthError, canManageInventory } from '@/lib/auth';
import { parseJson, ok, withErrorHandling } from '@/lib/api-helpers';
import { receivePurchaseOrder } from '@/lib/purchasing';
import { recordAudit } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/db';
import { zReceivePoInput } from '@/lib/types';

export const runtime = 'nodejs';

export const POST = withErrorHandling(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  if (!canManageInventory(session.role)) {
    throw new AuthError('You do not have permission to receive purchase orders.', 403, 'FORBIDDEN');
  }
  const input = await parseJson(req, zReceivePoInput);
  const po = await receivePurchaseOrder(session.businessId, session.userId, params.id, input);
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'receive',
    entityType: COLLECTIONS.purchaseOrders,
    entityId: params.id,
    after: po,
  });
  return ok(po);
});
