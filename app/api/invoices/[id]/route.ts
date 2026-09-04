import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { parseJson, ok, withErrorHandling, BusinessRuleError } from '@/lib/api-helpers';
import { getDocOr404, updateDocById, deleteDocById } from '@/lib/repo';
import { withDerivedStatus } from '@/lib/invoicing';
import { recordAudit } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/db';
import type { Invoice } from '@/lib/types';

export const runtime = 'nodejs';

const zInvoicePatch = z.object({
  terms: z.string().trim().max(2000).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const GET = withErrorHandling(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const invoice = await getDocOr404<Invoice>(COLLECTIONS.invoices, session.businessId, params.id, 'Invoice');
  return ok(withDerivedStatus(invoice));
});

export const PATCH = withErrorHandling(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const before = await getDocOr404<Invoice>(COLLECTIONS.invoices, session.businessId, params.id, 'Invoice');
  const input = await parseJson(req, zInvoicePatch);
  const after = await updateDocById<Invoice>(COLLECTIONS.invoices, session.businessId, params.id, input, 'Invoice');
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'update',
    entityType: COLLECTIONS.invoices,
    entityId: params.id,
    before,
    after,
  });
  return ok(withDerivedStatus(after));
});

export const DELETE = withErrorHandling(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const before = await getDocOr404<Invoice>(COLLECTIONS.invoices, session.businessId, params.id, 'Invoice');
  if (before.status !== 'draft') {
    throw new BusinessRuleError('Only a draft invoice can be deleted.');
  }
  await deleteDocById(COLLECTIONS.invoices, session.businessId, params.id, 'Invoice');
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'delete',
    entityType: COLLECTIONS.invoices,
    entityId: params.id,
    before,
  });
  return ok({ success: true });
});
