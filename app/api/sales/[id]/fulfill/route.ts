import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth';
import { ok, withErrorHandling } from '@/lib/api-helpers';
import { fulfillSale } from '@/lib/sales';
import { recordAudit } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/db';

export const runtime = 'nodejs';

export const POST = withErrorHandling(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const sale = await fulfillSale(session.businessId, params.id);
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'fulfill',
    entityType: COLLECTIONS.sales,
    entityId: params.id,
    after: sale,
  });
  return ok(sale);
});
