import { NextRequest } from 'next/server';
import { requireSession, AuthError, canManageInventory } from '@/lib/auth';
import { parseJson, parseQuery, ok, withErrorHandling } from '@/lib/api-helpers';
import { listDocs } from '@/lib/repo';
import { createPurchaseOrder } from '@/lib/purchasing';
import { recordAudit } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/db';
import { zPurchaseOrderInput, type PurchaseOrder } from '@/lib/types';

export const runtime = 'nodejs';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSession();
  const query = parseQuery(req.nextUrl.searchParams);
  const searchParams = req.nextUrl.searchParams;
  const extraFilter: Record<string, unknown> = {};
  const status = searchParams.get('status');
  if (status) extraFilter.status = status;
  const supplierId = searchParams.get('supplierId');
  if (supplierId) extraFilter.supplierId = supplierId;

  const result = await listDocs<PurchaseOrder>(COLLECTIONS.purchaseOrders, {
    businessId: session.businessId,
    ...query,
    searchFields: ['poNumber'],
    extraFilter,
  });
  return ok(result);
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSession();
  if (!canManageInventory(session.role)) {
    throw new AuthError('You do not have permission to create purchase orders.', 403, 'FORBIDDEN');
  }
  const input = await parseJson(req, zPurchaseOrderInput);
  const po = await createPurchaseOrder(session.businessId, input);
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'create',
    entityType: COLLECTIONS.purchaseOrders,
    entityId: po._id,
    after: po,
  });
  return ok(po, 201);
});
