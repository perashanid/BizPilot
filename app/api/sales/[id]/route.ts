import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { parseJson, ok, withErrorHandling } from '@/lib/api-helpers';
import { getDocOr404, updateDocById } from '@/lib/repo';
import { recordAudit } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/db';
import type { Sale } from '@/lib/types';

export const runtime = 'nodejs';

const zSalePatch = z.object({ notes: z.string().trim().max(2000).optional() });

export const GET = withErrorHandling(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const sale = await getDocOr404<Sale>(COLLECTIONS.sales, session.businessId, params.id, 'Sale');
  return ok(sale);
});

export const PATCH = withErrorHandling(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const before = await getDocOr404<Sale>(COLLECTIONS.sales, session.businessId, params.id, 'Sale');
  const input = await parseJson(req, zSalePatch);
  const after = await updateDocById<Sale>(COLLECTIONS.sales, session.businessId, params.id, input, 'Sale');
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'update',
    entityType: COLLECTIONS.sales,
    entityId: params.id,
    before,
    after,
  });
  return ok(after);
});
