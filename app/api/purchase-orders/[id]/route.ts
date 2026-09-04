import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { parseJson, ok, withErrorHandling, BusinessRuleError } from '@/lib/api-helpers';
import { getDocOr404, updateDocById, deleteDocById } from '@/lib/repo';
import { recordAudit } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/db';
import type { PurchaseOrder } from '@/lib/types';

export const runtime = 'nodejs';

const zPoPatch = z.object({ notes: z.string().trim().max(2000).optional() });

export const GET = withErrorHandling(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const po = await getDocOr404<PurchaseOrder>(COLLECTIONS.purchaseOrders, session.businessId, params.id, 'Purchase order');
  return ok(po);
});

export const PATCH = withErrorHandling(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const before = await getDocOr404<PurchaseOrder>(COLLECTIONS.purchaseOrders, session.businessId, params.id, 'Purchase order');
  const input = await parseJson(req, zPoPatch);
  const after = await updateDocById<PurchaseOrder>(
    COLLECTIONS.purchaseOrders,
    session.businessId,
    params.id,
    input,
    'Purchase order'
  );
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'update',
    entityType: COLLECTIONS.purchaseOrders,
    entityId: params.id,
    before,
    after,
  });
  return ok(after);
});

export const DELETE = withErrorHandling(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const before = await getDocOr404<PurchaseOrder>(COLLECTIONS.purchaseOrders, session.businessId, params.id, 'Purchase order');
  if (before.status !== 'draft') {
    throw new BusinessRuleError('Only a draft purchase order can be deleted.');
  }
  await deleteDocById(COLLECTIONS.purchaseOrders, session.businessId, params.id, 'Purchase order');
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'delete',
    entityType: COLLECTIONS.purchaseOrders,
    entityId: params.id,
    before,
  });
  return ok({ success: true });
});
