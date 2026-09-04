import { col, COLLECTIONS, nextSequence } from './db';
import { newId } from './id';
import { BusinessRuleError, NotFoundError } from './api-helpers';
import { applyStockMovement, getInventoryRecord, weightedAverageCost } from './inventory';
import { getBusiness } from './business';
import type { PoLineItem, PurchaseOrder, PurchaseOrderInput, ReceivePoInput, Product } from './types';

export async function createPurchaseOrder(businessId: string, input: PurchaseOrderInput): Promise<PurchaseOrder> {
  const business = await getBusiness(businessId);
  if (!business) throw new NotFoundError('Business not found.');

  const subtotal = input.lineItems.reduce((sum, l) => sum + l.qtyOrdered * l.unitCost, 0);
  const seq = await nextSequence(businessId, 'po');
  const now = new Date().toISOString();

  const po: PurchaseOrder = {
    _id: newId(),
    businessId,
    poNumber: `${business.poSettings.prefix}${seq}`,
    supplierId: input.supplierId,
    lineItems: input.lineItems.map((l) => ({ ...l, qtyReceived: 0 })),
    subtotal,
    tax: 0,
    shipping: input.shipping,
    total: subtotal + input.shipping,
    amountPaid: 0,
    expectedDate: input.expectedDate,
    status: 'draft',
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
  };

  const pos = await col<PurchaseOrder>(COLLECTIONS.purchaseOrders);
  await pos.insertOne(po);
  return po;
}

export async function markPurchaseOrderSent(businessId: string, poId: string): Promise<PurchaseOrder> {
  const pos = await col<PurchaseOrder>(COLLECTIONS.purchaseOrders);
  const po = await pos.findOne({ _id: poId, businessId });
  if (!po) throw new NotFoundError('Purchase order not found.');
  if (po.status !== 'draft') throw new BusinessRuleError('Only a draft PO can be sent.');
  const result = await pos.findOneAndUpdate(
    { _id: poId, businessId },
    { $set: { status: 'sent', updatedAt: new Date().toISOString() } },
    { returnDocument: 'after' }
  );
  if (!result) throw new NotFoundError('Purchase order not found.');
  return result;
}

export async function cancelPurchaseOrder(businessId: string, poId: string): Promise<PurchaseOrder> {
  const pos = await col<PurchaseOrder>(COLLECTIONS.purchaseOrders);
  const po = await pos.findOne({ _id: poId, businessId });
  if (!po) throw new NotFoundError('Purchase order not found.');
  if (po.status === 'received' || po.status === 'partially_received') {
    throw new BusinessRuleError('Cannot cancel a PO that has already received stock.');
  }
  const result = await pos.findOneAndUpdate(
    { _id: poId, businessId },
    { $set: { status: 'cancelled', updatedAt: new Date().toISOString() } },
    { returnDocument: 'after' }
  );
  if (!result) throw new NotFoundError('Purchase order not found.');
  return result;
}

/** Supports partial receipt: receive 30 of 50 ordered, PO moves to partially_received. */
export async function receivePurchaseOrder(
  businessId: string,
  userId: string,
  poId: string,
  input: ReceivePoInput
): Promise<PurchaseOrder> {
  const pos = await col<PurchaseOrder>(COLLECTIONS.purchaseOrders);
  const po = await pos.findOne({ _id: poId, businessId });
  if (!po) throw new NotFoundError('Purchase order not found.');
  if (po.status === 'cancelled' || po.status === 'received') {
    throw new BusinessRuleError(`Cannot receive stock on a ${po.status} PO.`);
  }

  const products = await col<Product>(COLLECTIONS.products);
  const updatedLines: PoLineItem[] = [...po.lineItems];

  for (const receiveLine of input.lines) {
    const idx = updatedLines.findIndex(
      (l) => l.productId === receiveLine.productId && (l.variantId ?? null) === (receiveLine.variantId ?? null)
    );
    if (idx === -1) {
      throw new BusinessRuleError(`Product ${receiveLine.productId} is not on this purchase order.`);
    }
    const line = updatedLines[idx];
    const remaining = line.qtyOrdered - line.qtyReceived;
    if (receiveLine.qtyReceived > remaining) {
      throw new BusinessRuleError(
        `Cannot receive ${receiveLine.qtyReceived} of ${line.name} — only ${remaining} remaining on the order.`
      );
    }
    if (receiveLine.qtyReceived <= 0) continue;

    updatedLines[idx] = { ...line, qtyReceived: line.qtyReceived + receiveLine.qtyReceived };

    const product = await products.findOne({ _id: receiveLine.productId, businessId });
    if (product?.trackInventory) {
      const existing = await getInventoryRecord(businessId, receiveLine.productId, receiveLine.variantId);
      const newCost = weightedAverageCost(
        existing?.quantityOnHand ?? 0,
        product.costPrice,
        receiveLine.qtyReceived,
        line.unitCost
      );
      await products.updateOne({ _id: product._id, businessId }, { $set: { costPrice: newCost } });

      await applyStockMovement({
        businessId,
        userId,
        productId: receiveLine.productId,
        variantId: receiveLine.variantId,
        delta: receiveLine.qtyReceived,
        type: 'purchase',
        unitCost: line.unitCost,
        referenceType: 'purchase_order',
        referenceId: po._id,
      });
    }
  }

  const allReceived = updatedLines.every((l) => l.qtyReceived >= l.qtyOrdered);
  const anyReceived = updatedLines.some((l) => l.qtyReceived > 0);
  const status = allReceived ? 'received' : anyReceived ? 'partially_received' : po.status;

  const result = await pos.findOneAndUpdate(
    { _id: poId, businessId },
    {
      $set: {
        lineItems: updatedLines,
        status,
        receivedDate: allReceived ? new Date().toISOString() : po.receivedDate,
        updatedAt: new Date().toISOString(),
      },
    },
    { returnDocument: 'after' }
  );
  if (!result) throw new NotFoundError('Purchase order not found.');
  return result;
}
