import { col, COLLECTIONS } from './db';
import { newId, isValidId } from './id';
import { BusinessRuleError, NotFoundError } from './api-helpers';
import { getBusiness } from './business';
import type {
  InventoryAdjustInput,
  InventoryRecord,
  InventoryWithAvailable,
  Product,
  StockMovement,
  StockMovementType,
} from './types';

const DEFAULT_LOCATION = 'default';

function withAvailable(rec: InventoryRecord): InventoryWithAvailable {
  return { ...rec, available: rec.quantityOnHand - rec.quantityReserved };
}

export async function getInventoryRecord(
  businessId: string,
  productId: string,
  variantId: string | undefined,
  location = DEFAULT_LOCATION
): Promise<InventoryRecord | null> {
  const c = await col<InventoryRecord>(COLLECTIONS.inventory);
  return c.findOne({ businessId, productId, variantId: variantId ?? { $exists: false }, location });
}

export async function listInventory(businessId: string): Promise<InventoryWithAvailable[]> {
  const c = await col<InventoryRecord>(COLLECTIONS.inventory);
  const recs = await c.find({ businessId }).toArray();
  return recs.map(withAvailable);
}

export async function getAvailableQuantity(
  businessId: string,
  productId: string,
  variantId?: string,
  location = DEFAULT_LOCATION
): Promise<number> {
  const rec = await getInventoryRecord(businessId, productId, variantId, location);
  if (!rec) return 0;
  return rec.quantityOnHand - rec.quantityReserved;
}

interface ApplyMovementInput {
  businessId: string;
  userId: string;
  productId: string;
  variantId?: string;
  location?: string;
  delta: number; // positive = stock in, negative = stock out
  type: StockMovementType;
  unitCost: number;
  reason?: string;
  referenceType?: string;
  referenceId?: string;
  allowNegative?: boolean;
}

/**
 * The single primitive all stock changes go through: upserts the inventory record and
 * writes an immutable stockMovements audit entry in lockstep. Blocks going negative
 * unless the business permits backorders or the caller explicitly allows it (returns/adjustments).
 */
export async function applyStockMovement(input: ApplyMovementInput): Promise<StockMovement> {
  const location = input.location ?? DEFAULT_LOCATION;
  const inventoryCol = await col<InventoryRecord>(COLLECTIONS.inventory);

  const existing = await getInventoryRecord(input.businessId, input.productId, input.variantId, location);
  const currentQty = existing?.quantityOnHand ?? 0;
  const nextQty = currentQty + input.delta;

  if (nextQty < 0 && !input.allowNegative) {
    const business = await getBusiness(input.businessId);
    if (!business?.allowBackorders) {
      throw new BusinessRuleError(
        `Not enough stock available (have ${currentQty}, need ${-input.delta}).`,
        'INSUFFICIENT_STOCK'
      );
    }
  }

  const now = new Date().toISOString();
  if (existing) {
    await inventoryCol.updateOne(
      { _id: existing._id },
      { $set: { quantityOnHand: nextQty, updatedAt: now } }
    );
  } else {
    const doc: InventoryRecord = {
      _id: newId(),
      businessId: input.businessId,
      productId: input.productId,
      variantId: input.variantId,
      location,
      quantityOnHand: nextQty,
      quantityReserved: 0,
      createdAt: now,
      updatedAt: now,
    };
    await inventoryCol.insertOne(doc);
  }

  const movementsCol = await col<StockMovement>(COLLECTIONS.stockMovements);
  const movement: StockMovement = {
    _id: newId(),
    businessId: input.businessId,
    productId: input.productId,
    variantId: input.variantId,
    location,
    type: input.type,
    quantityDelta: input.delta,
    quantityAfter: nextQty,
    unitCost: input.unitCost,
    reason: input.reason,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    userId: input.userId,
    timestamp: now,
    createdAt: now,
    updatedAt: now,
  };
  await movementsCol.insertOne(movement);
  return movement;
}

export async function adjustStock(
  businessId: string,
  userId: string,
  input: InventoryAdjustInput
): Promise<StockMovement> {
  const products = await col<Product>(COLLECTIONS.products);
  const product = await products.findOne({ _id: input.productId, businessId });
  if (!product) throw new NotFoundError('Product not found.');

  return applyStockMovement({
    businessId,
    userId,
    productId: input.productId,
    variantId: input.variantId,
    location: input.location,
    delta: input.delta,
    type: 'adjustment',
    unitCost: product.costPrice,
    reason: input.reason,
    allowNegative: true,
  });
}

/** Weighted-average cost update when receiving stock at a (possibly different) unit cost. */
export function weightedAverageCost(
  currentQty: number,
  currentCost: number,
  incomingQty: number,
  incomingCost: number
): number {
  const totalQty = currentQty + incomingQty;
  if (totalQty <= 0) return incomingCost;
  return Math.round((currentQty * currentCost + incomingQty * incomingCost) / totalQty);
}

export async function getStockMovementHistory(
  businessId: string,
  productId?: string,
  page = 1,
  limit = 50
): Promise<{ data: StockMovement[]; total: number }> {
  const c = await col<StockMovement>(COLLECTIONS.stockMovements);
  const filter: Record<string, unknown> = { businessId };
  if (productId && isValidId(productId)) filter.productId = productId;
  const [data, total] = await Promise.all([
    c
      .find(filter)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray(),
    c.countDocuments(filter),
  ]);
  return { data, total };
}

export function isBelowReorderPoint(available: number, reorderPoint: number): boolean {
  return available <= reorderPoint;
}
