import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth';
import { parseJson, ok, withErrorHandling } from '@/lib/api-helpers';
import { getDocOr404, updateDocById, deleteDocById } from '@/lib/repo';
import { recordAudit } from '@/lib/audit';
import { col, COLLECTIONS } from '@/lib/db';
import { zCustomerInput, type Customer, type CustomerWithStats, type Sale, type Invoice } from '@/lib/types';

export const runtime = 'nodejs';

export const GET = withErrorHandling(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const customer = await getDocOr404<Customer>(COLLECTIONS.customers, session.businessId, params.id, 'Customer');

  const salesCol = await col<Sale>(COLLECTIONS.sales);
  const invoicesCol = await col<Invoice>(COLLECTIONS.invoices);

  const [salesAgg, invoiceAgg] = await Promise.all([
    salesCol
      .aggregate<{ _id: null; totalSpend: number; lastOrderDate: string | null }>([
        {
          $match: {
            businessId: session.businessId,
            customerId: params.id,
            status: { $in: ['confirmed', 'fulfilled'] },
          },
        },
        { $group: { _id: null, totalSpend: { $sum: '$grandTotal' }, lastOrderDate: { $max: '$date' } } },
      ])
      .toArray(),
    invoicesCol
      .aggregate<{ _id: null; outstandingBalance: number }>([
        {
          $match: {
            businessId: session.businessId,
            customerId: params.id,
            status: { $ne: 'void' },
          },
        },
        { $group: { _id: null, outstandingBalance: { $sum: '$amountDue' } } },
      ])
      .toArray(),
  ]);

  const result: CustomerWithStats = {
    ...customer,
    totalSpend: salesAgg[0]?.totalSpend ?? 0,
    outstandingBalance: invoiceAgg[0]?.outstandingBalance ?? 0,
    lastOrderDate: salesAgg[0]?.lastOrderDate ?? null,
  };
  return ok(result);
});

export const PATCH = withErrorHandling(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const before = await getDocOr404<Customer>(COLLECTIONS.customers, session.businessId, params.id, 'Customer');
  const input = await parseJson(req, zCustomerInput.partial());
  const after = await updateDocById<Customer>(
    COLLECTIONS.customers,
    session.businessId,
    params.id,
    input,
    'Customer'
  );
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'update',
    entityType: COLLECTIONS.customers,
    entityId: params.id,
    before,
    after,
  });
  return ok(after);
});

export const DELETE = withErrorHandling(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const before = await getDocOr404<Customer>(COLLECTIONS.customers, session.businessId, params.id, 'Customer');
  const after = await updateDocById<Customer>(
    COLLECTIONS.customers,
    session.businessId,
    params.id,
    { status: 'inactive' },
    'Customer'
  );
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'delete',
    entityType: COLLECTIONS.customers,
    entityId: params.id,
    before,
    after,
  });
  return ok(after);
});
