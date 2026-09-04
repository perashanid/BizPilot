import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession, AuthError, canEditFinancials } from '@/lib/auth';
import { parseJson, ok, withErrorHandling } from '@/lib/api-helpers';
import { getDocOr404 } from '@/lib/repo';
import { recordPayment } from '@/lib/payments';
import { recordAudit } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/db';
import { zDateStr, PAYMENT_METHODS, type Invoice, type PaymentInput } from '@/lib/types';

export const runtime = 'nodejs';

const zRecordPaymentBody = z.object({
  amount: z.number().int().min(1),
  date: zDateStr,
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const POST = withErrorHandling(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  if (!canEditFinancials(session.role)) {
    throw new AuthError('You do not have permission to record payments.', 403, 'FORBIDDEN');
  }
  const invoice = await getDocOr404<Invoice>(COLLECTIONS.invoices, session.businessId, params.id, 'Invoice');
  const body = await parseJson(req, zRecordPaymentBody);

  const input: PaymentInput = {
    direction: 'in',
    invoiceId: params.id,
    customerId: invoice.customerId,
    amount: body.amount,
    date: body.date,
    method: body.method,
    reference: body.reference,
    notes: body.notes,
  };

  const payment = await recordPayment(session.businessId, session.userId, input);
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'record_payment',
    entityType: COLLECTIONS.invoices,
    entityId: params.id,
    after: payment,
  });
  return ok(payment, 201);
});
