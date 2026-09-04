import { NextRequest } from 'next/server';
import { requireSession, canManageInventory, AuthError } from '@/lib/auth';
import { parseJson, ok, withErrorHandling } from '@/lib/api-helpers';
import { adjustStock } from '@/lib/inventory';
import { recordAudit } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/db';
import { zInventoryAdjustInput } from '@/lib/types';

export const runtime = 'nodejs';

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSession();
  if (!canManageInventory(session.role)) {
    throw new AuthError('You do not have permission to adjust inventory.', 403, 'FORBIDDEN');
  }
  const input = await parseJson(req, zInventoryAdjustInput);
  const movement = await adjustStock(session.businessId, session.userId, input);
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'update',
    entityType: COLLECTIONS.inventory,
    entityId: movement.productId,
    after: movement,
  });
  return ok(movement, 201);
});
