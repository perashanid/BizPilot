import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth';
import { parseJson, ok, withErrorHandling, BusinessRuleError, NotFoundError } from '@/lib/api-helpers';
import { getDocOr404, updateDocById } from '@/lib/repo';
import { col, COLLECTIONS } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import { createPurchaseOrder } from '@/lib/purchasing';
import { sendInvoice } from '@/lib/invoicing';
import { zInsightActionInput, type Insight, type Product } from '@/lib/types';

export const runtime = 'nodejs';

export const POST = withErrorHandling(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const input = await parseJson(req, zInsightActionInput);
  const before = await getDocOr404<Insight>(COLLECTIONS.insights, session.businessId, params.id, 'Insight');

  if (input.decision === 'dismiss') {
    const after = await updateDocById<Insight>(
      COLLECTIONS.insights,
      session.businessId,
      params.id,
      { status: 'dismissed' },
      'Insight'
    );
    await recordAudit({
      businessId: session.businessId,
      userId: session.userId,
      action: 'dismiss_insight',
      entityType: COLLECTIONS.insights,
      entityId: params.id,
      before,
      after,
    });
    return ok(after);
  }

  if (input.decision === 'snooze') {
    const snoozedUntil = new Date(Date.now() + 7 * 86400000).toISOString();
    const after = await updateDocById<Insight>(
      COLLECTIONS.insights,
      session.businessId,
      params.id,
      { status: 'snoozed', snoozedUntil },
      'Insight'
    );
    await recordAudit({
      businessId: session.businessId,
      userId: session.userId,
      action: 'snooze_insight',
      entityType: COLLECTIONS.insights,
      entityId: params.id,
      before,
      after,
    });
    return ok(after);
  }

  if (input.decision === 'accept') {
    const after = await updateDocById<Insight>(
      COLLECTIONS.insights,
      session.businessId,
      params.id,
      { status: 'accepted' },
      'Insight'
    );
    await recordAudit({
      businessId: session.businessId,
      userId: session.userId,
      action: 'accept_insight',
      entityType: COLLECTIONS.insights,
      entityId: params.id,
      before,
      after,
    });
    return ok(after);
  }

  // input.decision === 'execute'
  const actionType = before.suggestedAction.type;

  if (actionType === 'create_purchase_order') {
    const payload = (before.suggestedAction.payload ?? {}) as {
      productId?: string;
      supplierId?: string;
      qty?: number;
    };
    if (!payload.supplierId) {
      throw new BusinessRuleError('No supplier on file for this product — add one first.');
    }
    if (!payload.productId) {
      throw new BusinessRuleError('This insight has no product to reorder.');
    }

    const products = await col<Product>(COLLECTIONS.products);
    const product = await products.findOne({ _id: payload.productId, businessId: session.businessId });
    if (!product) throw new NotFoundError('Product not found.');

    const qty = typeof payload.qty === 'number' && payload.qty > 0 ? Math.floor(payload.qty) : 1;
    const purchaseOrder = await createPurchaseOrder(session.businessId, {
      supplierId: payload.supplierId,
      lineItems: [
        {
          productId: product._id,
          name: product.name,
          sku: product.sku,
          qtyOrdered: qty,
          qtyReceived: 0,
          unitCost: product.costPrice,
        },
      ],
      shipping: 0,
    });

    const after = await updateDocById<Insight>(
      COLLECTIONS.insights,
      session.businessId,
      params.id,
      { status: 'accepted' },
      'Insight'
    );
    await recordAudit({
      businessId: session.businessId,
      userId: session.userId,
      action: 'execute_insight_create_purchase_order',
      entityType: COLLECTIONS.insights,
      entityId: params.id,
      before,
      after: { insight: after, purchaseOrder },
    });
    return ok({ insight: after, purchaseOrder });
  }

  if (actionType === 'send_invoice_reminder') {
    const payload = (before.suggestedAction.payload ?? {}) as { invoiceId?: string };
    if (!payload.invoiceId) {
      throw new BusinessRuleError('This insight has no invoice to send a reminder for.');
    }

    const invoice = await sendInvoice(session.businessId, payload.invoiceId);

    const after = await updateDocById<Insight>(
      COLLECTIONS.insights,
      session.businessId,
      params.id,
      { status: 'accepted' },
      'Insight'
    );
    await recordAudit({
      businessId: session.businessId,
      userId: session.userId,
      action: 'execute_insight_send_invoice_reminder',
      entityType: COLLECTIONS.insights,
      entityId: params.id,
      before,
      after: { insight: after, invoice },
    });
    return ok({ insight: after, invoice });
  }

  // 'review_pricing' / 'view_report' / 'none': navigation hints for the frontend only —
  // nothing to execute server-side, just acknowledge.
  const after = await updateDocById<Insight>(
    COLLECTIONS.insights,
    session.businessId,
    params.id,
    { status: 'accepted' },
    'Insight'
  );
  return ok(after);
});
