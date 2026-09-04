import { col, COLLECTIONS, nextSequence } from './db';
import { newId } from './id';
import { BusinessRuleError, NotFoundError } from './api-helpers';
import { applyStockMovement } from './inventory';
import { getBusiness } from './business';
import { lineSubtotal, taxForLine } from './money';
import type { Product, Sale, SaleInput, SaleLineItem, SaleStatus } from './types';

interface ComputedLine extends SaleLineItem {
  lineTotal: number;
  unitCost: number;
}

async function priceLineItems(
  businessId: string,
  lineItems: SaleLineItem[]
): Promise<{ lines: ComputedLine[]; subtotal: number; taxTotal: number }> {
  const products = await col<Product>(COLLECTIONS.products);
  const ids = [...new Set(lineItems.map((l) => l.productId))];
  const found = await products.find({ businessId, _id: { $in: ids } }).toArray();
  const byId = new Map(found.map((p) => [p._id, p]));

  let subtotal = 0;
  let taxTotal = 0;
  const lines: ComputedLine[] = lineItems.map((line) => {
    const product = byId.get(line.productId);
    if (!product) throw new NotFoundError(`Product ${line.productId} not found.`);
    const lineSub = lineSubtotal(line.qty, line.unitPrice, line.discount);
    const tax = taxForLine(line.qty, line.unitPrice, line.discount, line.taxRate);
    subtotal += lineSub;
    taxTotal += tax;
    return { ...line, lineTotal: lineSub + tax, unitCost: product.costPrice };
  });

  return { lines, subtotal, taxTotal };
}

export async function createSale(businessId: string, userId: string, input: SaleInput): Promise<Sale> {
  const business = await getBusiness(businessId);
  if (!business) throw new NotFoundError('Business not found.');

  const { lines, subtotal, taxTotal } = await priceLineItems(businessId, input.lineItems);
  const orderSeq = await nextSequence(businessId, 'order');
  const now = new Date().toISOString();

  const sale: Sale = {
    _id: newId(),
    businessId,
    orderNumber: `${business.orderSettings.prefix}${orderSeq}`,
    customerId: input.customerId,
    lineItems: lines,
    subtotal,
    discountTotal: input.discountTotal,
    taxTotal,
    grandTotal: Math.max(0, subtotal + taxTotal - input.discountTotal),
    channel: input.channel,
    status: 'confirmed',
    paymentStatus: 'unpaid',
    amountPaid: 0,
    date: input.date || now,
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
  };

  // Decrement stock for every trackable line item. If any line fails (insufficient stock),
  // nothing has been persisted yet, so we simply throw before the insert.
  for (const line of sale.lineItems) {
    const product = await (await col<Product>(COLLECTIONS.products)).findOne({ _id: line.productId, businessId });
    if (product?.trackInventory) {
      await applyStockMovement({
        businessId,
        userId,
        productId: line.productId,
        variantId: line.variantId,
        delta: -line.qty,
        type: 'sale',
        unitCost: line.unitCost,
        referenceType: 'sale',
        referenceId: sale._id,
      });
    }
  }

  const sales = await col<Sale>(COLLECTIONS.sales);
  await sales.insertOne(sale);
  return sale;
}

async function reverseStockForSale(businessId: string, userId: string, sale: Sale): Promise<void> {
  const products = await col<Product>(COLLECTIONS.products);
  for (const line of sale.lineItems) {
    const product = await products.findOne({ _id: line.productId, businessId });
    if (product?.trackInventory) {
      await applyStockMovement({
        businessId,
        userId,
        productId: line.productId,
        variantId: line.variantId,
        delta: line.qty,
        type: 'return',
        unitCost: line.unitCost,
        referenceType: 'sale',
        referenceId: sale._id,
        allowNegative: true,
      });
    }
  }
}

async function transitionSale(
  businessId: string,
  saleId: string,
  from: SaleStatus[],
  to: SaleStatus
): Promise<Sale> {
  const sales = await col<Sale>(COLLECTIONS.sales);
  const sale = await sales.findOne({ _id: saleId, businessId });
  if (!sale) throw new NotFoundError('Sale not found.');
  if (!from.includes(sale.status)) {
    throw new BusinessRuleError(`Sale must be ${from.join(' or ')} to do this (currently ${sale.status}).`);
  }
  const result = await sales.findOneAndUpdate(
    { _id: saleId, businessId },
    { $set: { status: to, updatedAt: new Date().toISOString() } },
    { returnDocument: 'after' }
  );
  if (!result) throw new NotFoundError('Sale not found.');
  return result;
}

export async function fulfillSale(businessId: string, saleId: string): Promise<Sale> {
  return transitionSale(businessId, saleId, ['confirmed'], 'fulfilled');
}

export async function cancelSale(businessId: string, userId: string, saleId: string): Promise<Sale> {
  const sales = await col<Sale>(COLLECTIONS.sales);
  const sale = await sales.findOne({ _id: saleId, businessId });
  if (!sale) throw new NotFoundError('Sale not found.');
  if (sale.status === 'cancelled' || sale.status === 'refunded') {
    throw new BusinessRuleError(`Sale is already ${sale.status}.`);
  }
  if (sale.amountPaid > 0) {
    throw new BusinessRuleError('Cannot cancel a sale that has payments recorded. Refund it instead.');
  }
  await reverseStockForSale(businessId, userId, sale);
  return transitionSale(businessId, sale._id, [sale.status], 'cancelled');
}

export async function refundSale(businessId: string, userId: string, saleId: string): Promise<Sale> {
  const sales = await col<Sale>(COLLECTIONS.sales);
  const sale = await sales.findOne({ _id: saleId, businessId });
  if (!sale) throw new NotFoundError('Sale not found.');
  if (sale.status !== 'confirmed' && sale.status !== 'fulfilled') {
    throw new BusinessRuleError('Only confirmed or fulfilled sales can be refunded.');
  }
  await reverseStockForSale(businessId, userId, sale);
  const result = await sales.findOneAndUpdate(
    { _id: saleId, businessId },
    { $set: { status: 'refunded', paymentStatus: 'unpaid', updatedAt: new Date().toISOString() } },
    { returnDocument: 'after' }
  );
  if (!result) throw new NotFoundError('Sale not found.');
  return result;
}
