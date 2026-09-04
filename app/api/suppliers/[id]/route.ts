import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth';
import { parseJson, ok, withErrorHandling } from '@/lib/api-helpers';
import { getDocOr404, updateDocById } from '@/lib/repo';
import { recordAudit } from '@/lib/audit';
import { col, COLLECTIONS } from '@/lib/db';
import { zSupplierInput, type Supplier, type SupplierWithStats, type PurchaseOrder } from '@/lib/types';

export const runtime = 'nodejs';

export const GET = withErrorHandling(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const supplier = await getDocOr404<Supplier>(COLLECTIONS.suppliers, session.businessId, params.id, 'Supplier');

  const poCol = await col<PurchaseOrder>(COLLECTIONS.purchaseOrders);

  const [payableAgg, deliveryAgg] = await Promise.all([
    poCol
      .aggregate<{ _id: null; outstandingPayable: number }>([
        {
          $match: {
            businessId: session.businessId,
            supplierId: params.id,
            status: { $ne: 'cancelled' },
          },
        },
        { $group: { _id: null, outstandingPayable: { $sum: { $subtract: ['$total', '$amountPaid'] } } } },
      ])
      .toArray(),
    poCol
      .aggregate<{ _id: null; totalReceived: number; onTime: number }>([
        {
          $match: {
            businessId: session.businessId,
            supplierId: params.id,
            status: 'received',
          },
        },
        {
          $group: {
            _id: null,
            totalReceived: { $sum: 1 },
            onTime: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ['$receivedDate', null] },
                      { $ne: ['$expectedDate', null] },
                      { $lte: ['$receivedDate', '$expectedDate'] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ])
      .toArray(),
  ]);

  const totalReceived = deliveryAgg[0]?.totalReceived ?? 0;
  const onTime = deliveryAgg[0]?.onTime ?? 0;
  const onTimeDeliveryRate = totalReceived < 1 ? null : Math.round((onTime / totalReceived) * 1000) / 10;

  const result: SupplierWithStats = {
    ...supplier,
    outstandingPayable: payableAgg[0]?.outstandingPayable ?? 0,
    onTimeDeliveryRate,
  };
  return ok(result);
});

export const PATCH = withErrorHandling(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const before = await getDocOr404<Supplier>(COLLECTIONS.suppliers, session.businessId, params.id, 'Supplier');
  const input = await parseJson(req, zSupplierInput.partial());
  const after = await updateDocById<Supplier>(
    COLLECTIONS.suppliers,
    session.businessId,
    params.id,
    input,
    'Supplier'
  );
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'update',
    entityType: COLLECTIONS.suppliers,
    entityId: params.id,
    before,
    after,
  });
  return ok(after);
});

export const DELETE = withErrorHandling(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const before = await getDocOr404<Supplier>(COLLECTIONS.suppliers, session.businessId, params.id, 'Supplier');
  const after = await updateDocById<Supplier>(
    COLLECTIONS.suppliers,
    session.businessId,
    params.id,
    { status: 'inactive' },
    'Supplier'
  );
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'delete',
    entityType: COLLECTIONS.suppliers,
    entityId: params.id,
    before,
    after,
  });
  return ok(after);
});
