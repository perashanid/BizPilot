/**
 * Seeds a realistic ~12-month history for one demo business ("Northside Hardware & Supply").
 * Run: `npm run seed` (or `tsx scripts/seed.ts --force` to wipe and reseed).
 *
 * This bypasses the lib/ mutation functions (createSale, applyStockMovement, ...) because those
 * all stamp "now" as the timestamp — we need documents spread across the last year. Instead we
 * replicate their math (lib/money.ts helpers) while setting historical dates ourselves, and keep
 * a per-product running stock/cost ledger so every stockMovement, the final inventory documents,
 * and every invoice/payment balance agree with each other.
 */
import 'dotenv/config';
import { Db, Document, Filter } from 'mongodb';
import { getDb, COLLECTIONS } from '../lib/db';
import { newId } from '../lib/id';
import { hashPassword } from '../lib/auth';
import { createBusiness } from '../lib/business';
import { lineSubtotal, taxForLine } from '../lib/money';
import type {
  Business,
  User,
  Role,
  Customer,
  Product,
  Supplier,
  PurchaseOrder,
  PoLineItem,
  Sale,
  SaleLineItem,
  Invoice,
  Payment,
  PaymentMethod,
  Expense,
  Employee,
  Task,
  InventoryRecord,
  StockMovement,
} from '../lib/types';
import { PAYMENT_METHODS } from '../lib/types';

const DAY = 86400000;

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: readonly T[]): T {
  return arr[rand(0, arr.length - 1)];
}
function iso(ms: number): string {
  return new Date(ms).toISOString();
}
function daysAgo(n: number, base: number): number {
  return base - n * DAY;
}
// Higher weight in spring/summer (northern-hemisphere hardware-store seasonality).
const MONTH_WEIGHTS = [0.6, 0.6, 0.8, 1.3, 1.5, 1.6, 1.6, 1.5, 1.1, 0.8, 0.6, 0.6];
function weightedTimestamp(startMs: number, endMs: number): number {
  for (let attempt = 0; attempt < 25; attempt++) {
    const t = startMs + Math.random() * (endMs - startMs);
    const w = MONTH_WEIGHTS[new Date(t).getMonth()];
    if (Math.random() < w / 1.6) return t;
  }
  return startMs + Math.random() * (endMs - startMs);
}

interface StockLedger {
  qty: number;
  cost: number;
}

export async function runSeed(force: boolean): Promise<void> {
  const db = await getDb();
  const existing = await db.collection(COLLECTIONS.businesses).countDocuments();
  if (existing > 0 && !force) {
    console.log('Database is not empty — skipping seed. Pass --force to wipe and reseed.');
    return;
  }
  if (existing > 0 && force) {
    console.log('Wiping existing collections...');
    for (const name of Object.values(COLLECTIONS)) {
      await db.collection(name).deleteMany({});
    }
  }

  const now = Date.now();
  const yearAgo = daysAgo(365, now);
  const nowIso = iso(now);

  // ---------------------------------------------------------------------
  // Business
  // ---------------------------------------------------------------------
  const business = await createBusiness(
    {
      name: 'Northside Hardware & Supply',
      legalName: 'Northside Hardware & Supply LLC',
      industry: 'Retail — Hardware',
      currency: 'USD',
      timezone: 'America/Chicago',
      fiscalYearStartMonth: 1,
      address: '412 Elm Street, Springfield, IL',
    },
    { isDemo: true }
  );
  const businessId = business._id;
  await db.collection(COLLECTIONS.businesses).updateOne(
    { _id: businessId } as unknown as Filter<Document>,
    {
      $set: {
        taxSettings: { rates: [{ name: 'Sales Tax', rate: 7.25, isDefault: true }], pricesIncludeTax: false },
        invoiceSettings: { prefix: 'INV-', nextNumber: 1247, terms: 'Net 30. Thank you for your business.' },
        poSettings: { prefix: 'PO-', nextNumber: 1084 },
        orderSettings: { prefix: 'SO-', nextNumber: 1901 },
        onboardingComplete: true,
      },
    }
  );

  // ---------------------------------------------------------------------
  // Users
  // ---------------------------------------------------------------------
  const passwordHash = await hashPassword('demo1234');
  function mkUser(name: string, email: string, role: Role): User {
    return {
      _id: newId(),
      businessId,
      name,
      email,
      passwordHash,
      role,
      status: 'active',
      lastLoginAt: nowIso,
      createdAt: iso(daysAgo(365, now)),
      updatedAt: nowIso,
    };
  }
  const owner = mkUser('Maria Chen', 'demo@smecopilot.app', 'owner');
  const manager = mkUser('David Kim', 'david.kim@northsidehardware.example', 'manager');
  const staff1 = mkUser('Jasmine Ortiz', 'jasmine.ortiz@northsidehardware.example', 'staff');
  const staff2 = mkUser('Tyrell Brooks', 'tyrell.brooks@northsidehardware.example', 'staff');
  const accountant = mkUser('Priya Nair', 'priya.nair@northsidehardware.example', 'accountant');
  const users = [owner, manager, staff1, staff2, accountant];
  await db.collection<User>(COLLECTIONS.users).insertMany(users);

  // ---------------------------------------------------------------------
  // Suppliers
  // ---------------------------------------------------------------------
  const supplierDefs = [
    { name: 'Ironclad Distributors', lead: 10, terms: 30 },
    { name: 'Prairie Fastener Co.', lead: 7, terms: 15 },
    { name: 'BrightBolt Wholesale', lead: 14, terms: 30 },
    { name: 'Midwest Power Tool Supply', lead: 21, terms: 45 },
    { name: 'GreenYard Lawn & Garden', lead: 12, terms: 30 },
    { name: 'SafeGuard PPE Partners', lead: 9, terms: 15 },
    { name: 'Sterling Plumbing Supply', lead: 8, terms: 30 },
    { name: 'Volt & Wire Electrical', lead: 15, terms: 30 },
  ];
  const suppliers: Supplier[] = supplierDefs.map((s, i) => ({
    _id: newId(),
    businessId,
    name: s.name,
    contactPerson: pick(['Alex Reyes', 'Sam Patel', 'Jordan Lee', 'Chris Nolan', 'Taylor Grant']),
    email: `sales@${s.name.toLowerCase().replace(/[^a-z]+/g, '')}.example`,
    phone: `(555) 01${i}-${rand(1000, 9999)}`,
    address: `${rand(100, 999)} Industrial Pkwy, Springfield, IL`,
    paymentTermsDays: s.terms,
    leadTimeDays: s.lead,
    productIds: [],
    status: 'active',
    createdAt: iso(yearAgo),
    updatedAt: nowIso,
  }));
  const SUPPLIER_LATE = suppliers[0]; // late-delivery story

  // ---------------------------------------------------------------------
  // Products
  // ---------------------------------------------------------------------
  const categories = [
    'Hand Tools',
    'Power Tools',
    'Fasteners',
    'Plumbing',
    'Electrical',
    'Paint & Supplies',
    'Lawn & Garden',
    'Safety Equipment',
  ];
  const productNamesByCategory: Record<string, string[]> = {
    'Hand Tools': ['16oz Claw Hammer', 'Adjustable Wrench 10"', 'Tape Measure 25ft', 'Utility Knife', 'Screwdriver Set (6pc)'],
    'Power Tools': ['Cordless Drill 20V', 'Circular Saw 7-1/4"', 'Angle Grinder 4.5"', 'Orbital Sander', 'Reciprocating Saw'],
    Fasteners: ['Wood Screws #8 (1lb box)', 'Deck Screws 3" (5lb box)', 'Hex Bolts M8 (100pk)', 'Drywall Anchors (50pk)', 'Machine Screws Assortment'],
    Plumbing: ['PVC Pipe 1/2" (10ft)', 'Ball Valve 3/4"', 'Teflon Tape (10pk)', 'Compression Fitting Kit', 'Drain Snake 25ft'],
    Electrical: ['12AWG Wire (100ft)', 'Duplex Outlet', 'Circuit Breaker 20A', 'LED Shop Light', 'Wire Nuts Assortment'],
    'Paint & Supplies': ['Interior Paint 1gal — White', 'Paint Roller Kit', 'Drop Cloth 9x12', 'Painters Tape 2"', 'Exterior Stain 1gal'],
    'Lawn & Garden': ['Garden Hose 50ft', 'Pruning Shears', 'Wheelbarrow 6cu.ft', 'Grass Seed 10lb', 'Leaf Rake'],
    'Safety Equipment': ['Safety Glasses', 'Work Gloves (pair)', 'Hard Hat', 'Respirator N95 (10pk)', 'Hi-Vis Safety Vest'],
  };

  type ProductDef = { name: string; category: string; cost: number; sale: number; reorderPoint: number };
  const productDefs: ProductDef[] = [];
  for (const cat of categories) {
    for (const name of productNamesByCategory[cat]) {
      const cost = rand(500, 9000); // cents
      const marginMult = 1 + rand(35, 80) / 100; // hardware-retail-typical keystone-ish markup
      productDefs.push({ name, category: cat, cost, sale: Math.round(cost * marginMult), reorderPoint: rand(8, 25) });
    }
  }
  // productDefs.length === 40

  const products: Product[] = productDefs.map((p, i) => ({
    _id: newId(),
    businessId,
    name: p.name,
    sku: `${p.category.slice(0, 3).toUpperCase()}-${String(1000 + i)}`,
    barcode: `0${rand(10000000000, 99999999999)}`,
    category: p.category,
    unit: 'unit',
    costPrice: p.cost,
    salePrice: p.sale,
    taxRate: 7.25,
    reorderPoint: p.reorderPoint,
    trackInventory: true,
    status: 'active',
    variants: [],
    createdAt: iso(yearAgo),
    updatedAt: nowIso,
  }));

  // Assign each product to one supplier, round-robin.
  const supplierOf = new Map<string, string>();
  products.forEach((p, i) => supplierOf.set(p._id, suppliers[i % suppliers.length]._id));
  for (const s of suppliers) {
    s.productIds = products.filter((p) => supplierOf.get(p._id) === s._id).map((p) => p._id);
  }

  // Story products (indices chosen arbitrarily from the generated list).
  const PRODUCT_MARGIN_DECLINE = products[2]; // "Tape Measure 25ft"
  const PRODUCT_STOCKOUT_ZERO = products[10]; // an Power Tools item — critical, available = 0
  const PRODUCT_STOCKOUT_AT_REORDER = products[14]; // Fasteners item — warning, available = reorderPoint
  const PRODUCT_VELOCITY_RISK = products[20]; // Electrical item — opportunity, selling fast

  // ---------------------------------------------------------------------
  // Customers
  // ---------------------------------------------------------------------
  const customerFirstNames = ['James', 'Linda', 'Robert', 'Patricia', 'Michael', 'Barbara', 'William', 'Elizabeth', 'David', 'Jennifer', 'Carlos', 'Fatima', 'Wei', 'Anika', 'Noah', 'Sofia', 'Ethan', 'Grace', 'Omar', 'Lucia', 'Henry', 'Maya', 'Diego', 'Ruth', 'Samuel'];
  const contractorSuffixes = [' Contracting', ' Builders', ' Renovations', ' Property Group', ' Maintenance LLC'];
  const customers: Customer[] = customerFirstNames.map((fn, i) => {
    const isBusiness = i % 3 === 0;
    const lastName = pick(['Alvarez', 'Nguyen', 'Johnson', 'Kowalski', 'Singh', 'Moreau', 'Osei', 'Park']);
    return {
      _id: newId(),
      businessId,
      name: `${fn} ${lastName}`,
      businessName: isBusiness ? `${lastName}${pick(contractorSuffixes)}` : undefined,
      email: `${fn.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
      phone: `(555) 02${i}-${rand(1000, 9999)}`,
      address: `${rand(100, 999)} ${pick(['Maple', 'Oak', 'Cedar', 'Birch', 'Pine'])} St, Springfield, IL`,
      taxId: isBusiness ? `EIN-${rand(10000000, 99999999)}` : undefined,
      paymentTermsDays: isBusiness ? pick([15, 30]) : 0,
      creditLimit: isBusiness ? rand(5, 20) * 100000 : 0,
      tags: isBusiness ? ['contractor'] : ['retail'],
      status: 'active',
      createdAt: iso(daysAgo(rand(200, 365), now)),
      updatedAt: nowIso,
    };
  });
  const CUSTOMER_QUIET = customers[3];

  // ---------------------------------------------------------------------
  // Stock ledger + chronological event processing.
  //
  // Sale/PO documents (and their monetary totals) are built immediately, since
  // those don't depend on cost history. But a sale line's `unitCost` snapshot
  // and a product's rolling weighted-average `costPrice` DO depend on exactly
  // which purchases happened before that sale, by SIMULATED DATE — not by the
  // order this script happens to generate them in. So every stock-affecting
  // event (a sale's line, or a PO's receipt) is queued here with a timestamp,
  // then replayed in chronological order at the end to compute correct,
  // date-accurate cost snapshots. This is what makes the margin-decline story
  // (and every other cost-sensitive figure) actually reconcile.
  // ---------------------------------------------------------------------
  const ledger = new Map<string, StockLedger>();
  const originalCost = new Map<string, number>();
  for (const p of products) {
    ledger.set(p._id, { qty: p.reorderPoint * 6 + rand(10, 30), cost: p.costPrice });
    originalCost.set(p._id, p.costPrice);
  }

  type LedgerEvent =
    | { ts: number; kind: 'sale'; productId: string; qty: number; referenceId: string; setUnitCost: (c: number) => void }
    | { ts: number; kind: 'po-receipt'; productId: string; qty: number; unitCost: number; referenceId: string };
  const ledgerEvents: LedgerEvent[] = [];

  const stockMovements: StockMovement[] = [];
  const purchaseOrders: PurchaseOrder[] = [];
  const sales: Sale[] = [];

  function weightedAverageCost(currentQty: number, currentCost: number, incomingQty: number, incomingCost: number): number {
    const totalQty = currentQty + incomingQty;
    if (totalQty <= 0) return incomingCost;
    return Math.round((currentQty * currentCost + incomingQty * incomingCost) / totalQty);
  }

  function makePo(
    supplier: Supplier,
    lines: { product: Product; qty: number; unitCost?: number }[],
    orderTs: number,
    status: PurchaseOrder['status'],
    receivedTs?: number,
    qtyReceivedOverride?: number[]
  ): PurchaseOrder {
    const lineItems: PoLineItem[] = lines.map((l, i) => ({
      productId: l.product._id,
      name: l.product.name,
      sku: l.product.sku,
      qtyOrdered: l.qty,
      qtyReceived: status === 'draft' || status === 'sent' ? 0 : qtyReceivedOverride ? qtyReceivedOverride[i] : l.qty,
      // Default to a small variance around the product's ORIGINAL cost basis (never the live,
      // possibly-already-mutated `product.costPrice`) so out-of-order generation can't leak a
      // later cost change into an earlier-dated purchase order.
      unitCost: l.unitCost ?? Math.round(originalCost.get(l.product._id)! * (1 + rand(-5, 8) / 100)),
    }));
    const subtotal = lineItems.reduce((s, l) => s + l.qtyOrdered * l.unitCost, 0);
    const shipping = rand(0, 2000);
    const po: PurchaseOrder = {
      _id: newId(),
      businessId,
      poNumber: `PO-${1000 + purchaseOrders.length}`,
      supplierId: supplier._id,
      lineItems,
      subtotal,
      tax: 0,
      shipping,
      total: subtotal + shipping,
      amountPaid: 0,
      expectedDate: iso(orderTs + supplier.leadTimeDays * DAY),
      receivedDate: status === 'received' || status === 'partially_received' ? iso(receivedTs ?? orderTs) : undefined,
      status,
      createdAt: iso(orderTs),
      updatedAt: iso(receivedTs ?? orderTs),
    };
    purchaseOrders.push(po);
    if (status === 'received' || status === 'partially_received') {
      for (const line of po.lineItems) {
        if (line.qtyReceived <= 0) continue;
        ledgerEvents.push({
          ts: receivedTs ?? orderTs,
          kind: 'po-receipt',
          productId: line.productId,
          qty: line.qtyReceived,
          unitCost: line.unitCost,
          referenceId: po._id,
        });
      }
    }
    return po;
  }

  function makeSaleLine(product: Product, qty: number, discount = 0): SaleLineItem & { lineTotal: number; unitCost: number } {
    const sub = lineSubtotal(qty, product.salePrice, discount);
    const tax = taxForLine(qty, product.salePrice, discount, product.taxRate);
    // unitCost is a placeholder until the chronological pass patches it via setUnitCost below.
    return { productId: product._id, name: product.name, qty, unitPrice: product.salePrice, discount, taxRate: product.taxRate, lineTotal: sub + tax, unitCost: 0 };
  }

  function makeSale(
    lineDefs: { product: Product; qty: number }[],
    ts: number,
    customer: Customer | undefined,
    status: Sale['status']
  ): Sale {
    const lineItems = lineDefs.map((l) => makeSaleLine(l.product, l.qty));
    const subtotal = lineItems.reduce((s, l) => s + lineSubtotal(l.qty, l.unitPrice, l.discount), 0);
    const taxTotal = lineItems.reduce((s, l) => s + taxForLine(l.qty, l.unitPrice, l.discount, l.taxRate), 0);
    const grandTotal = subtotal + taxTotal;
    const sale: Sale = {
      _id: newId(),
      businessId,
      orderNumber: `SO-${1900 + sales.length}`,
      customerId: customer?._id,
      lineItems,
      subtotal,
      discountTotal: 0,
      taxTotal,
      grandTotal,
      channel: customer ? 'in_store' : 'walk_in',
      status,
      paymentStatus: 'unpaid',
      amountPaid: 0,
      date: iso(ts),
      createdAt: iso(ts),
      updatedAt: iso(ts),
    };
    sales.push(sale);
    if (status === 'confirmed' || status === 'fulfilled') {
      for (const line of sale.lineItems) {
        ledgerEvents.push({
          ts,
          kind: 'sale',
          productId: line.productId,
          qty: line.qty,
          referenceId: sale._id,
          setUnitCost: (c) => {
            line.unitCost = c;
          },
        });
      }
    }
    return sale;
  }

  /** Replays every queued sale/receipt in true chronological order, so cost snapshots are accurate. */
  function replayLedgerEvents(): void {
    const sorted = [...ledgerEvents].sort((a, b) => a.ts - b.ts);
    for (const ev of sorted) {
      const led = ledger.get(ev.productId)!;
      if (ev.kind === 'sale') {
        const costAtTime = led.cost;
        led.qty -= ev.qty;
        ev.setUnitCost(costAtTime);
        stockMovements.push({
          _id: newId(),
          businessId,
          productId: ev.productId,
          location: 'default',
          type: 'sale',
          quantityDelta: -ev.qty,
          quantityAfter: led.qty,
          unitCost: costAtTime,
          referenceType: 'sale',
          referenceId: ev.referenceId,
          userId: owner._id,
          timestamp: iso(ev.ts),
          createdAt: iso(ev.ts),
          updatedAt: iso(ev.ts),
        });
      } else {
        const newCost = weightedAverageCost(led.qty, led.cost, ev.qty, ev.unitCost);
        led.cost = newCost;
        led.qty += ev.qty;
        const product = products.find((p) => p._id === ev.productId)!;
        product.costPrice = newCost;
        stockMovements.push({
          _id: newId(),
          businessId,
          productId: ev.productId,
          location: 'default',
          type: 'purchase',
          quantityDelta: ev.qty,
          quantityAfter: led.qty,
          unitCost: ev.unitCost,
          referenceType: 'purchase_order',
          referenceId: ev.referenceId,
          userId: owner._id,
          timestamp: iso(ev.ts),
          createdAt: iso(ev.ts),
          updatedAt: iso(ev.ts),
        });
      }
    }
  }

  // =======================================================================
  // STORY INJECTION — guarantees the insights engine has real findings.
  // =======================================================================

  // Story A: margin decline on PRODUCT_MARGIN_DECLINE.
  // Prior 30-60 day window: several sales at the ORIGINAL cost.
  for (let i = 0; i < 5; i++) {
    makeSale([{ product: PRODUCT_MARGIN_DECLINE, qty: 2 }], daysAgo(rand(31, 58), now), pick(customers), 'confirmed');
  }
  // A cost-increasing PO 20 days ago. The incoming quantity is deliberately large relative to
  // any plausible existing stock so the WEIGHTED-AVERAGE cost (lib/inventory.ts's formula, which
  // blends with whatever is already on hand) still comes out clearly higher — a modest qty at a
  // modest markup gets diluted away by blending and silently misses the insight's threshold.
  // The cost multiplier is scaled to this product's own sale/cost ratio so the new cost always
  // stays below the sale price (still profitable, just thinner) while producing a clearly
  // double-digit-point margin drop regardless of which random product got picked for this story.
  const marginDeclineSupplier = suppliers[supplierOf.get(PRODUCT_MARGIN_DECLINE._id) === suppliers[0]._id ? 1 : 0];
  const priceRatio = PRODUCT_MARGIN_DECLINE.salePrice / PRODUCT_MARGIN_DECLINE.costPrice;
  const costMultiplier = Math.min(1 + 0.18 * priceRatio, priceRatio - 0.03, 1.45);
  makePo(
    marginDeclineSupplier,
    [{ product: PRODUCT_MARGIN_DECLINE, qty: 300, unitCost: Math.round(PRODUCT_MARGIN_DECLINE.costPrice * costMultiplier) }],
    daysAgo(20, now),
    'received',
    daysAgo(18, now)
  );
  // Last 30 days: several sales at the NEW (higher) cost.
  for (let i = 0; i < 5; i++) {
    makeSale([{ product: PRODUCT_MARGIN_DECLINE, qty: 2 }], daysAgo(rand(1, 17), now), pick(customers), 'confirmed');
  }

  // Story B: late supplier — force 4 received POs with receivedDate well after expectedDate.
  const lateSupplierProducts = products.filter((p) => supplierOf.get(p._id) === SUPPLIER_LATE._id).slice(0, 4);
  for (const p of lateSupplierProducts) {
    const orderTs = daysAgo(rand(60, 300), now);
    const expectedTs = orderTs + SUPPLIER_LATE.leadTimeDays * DAY;
    const receivedTs = expectedTs + rand(6, 12) * DAY;
    makePo(SUPPLIER_LATE, [{ product: p, qty: rand(10, 30) }], orderTs, 'received', receivedTs);
  }

  // Story C: quiet customer — 5 evenly-spaced historical orders, none in the last 100 days.
  const quietOffsets = [250, 225, 200, 175, 150, 125, 100];
  for (const offset of quietOffsets) {
    makeSale([{ product: pick(products), qty: rand(1, 3) }], daysAgo(offset, now), CUSTOMER_QUIET, 'confirmed');
  }

  // Story D: near-stockout products (final quantities corrected below, after the bulk pass).
  for (let i = 0; i < 8; i++) {
    makeSale([{ product: PRODUCT_STOCKOUT_ZERO, qty: rand(1, 3) }], daysAgo(rand(1, 28), now), pick(customers), 'confirmed');
    makeSale([{ product: PRODUCT_STOCKOUT_AT_REORDER, qty: rand(1, 3) }], daysAgo(rand(1, 28), now), pick(customers), 'confirmed');
  }
  // High recent velocity for the "selling fast, about to run out" product.
  for (let i = 0; i < 15; i++) {
    makeSale([{ product: PRODUCT_VELOCITY_RISK, qty: rand(1, 3) }], daysAgo(rand(1, 25), now), pick(customers), 'confirmed');
  }

  // =======================================================================
  // BULK BACKGROUND HISTORY — realistic noise across the full year.
  // =======================================================================

  // Purchase orders (~55 more, on top of the 5 story POs above = ~60 total).
  for (let i = 0; i < 55; i++) {
    const supplier = pick(suppliers);
    const supplierProducts = products.filter((p) => supplierOf.get(p._id) === supplier._id);
    if (supplierProducts.length === 0) continue;
    const lineCount = rand(1, Math.min(4, supplierProducts.length));
    const chosen = [...supplierProducts].sort(() => Math.random() - 0.5).slice(0, lineCount);
    const orderTs = weightedTimestamp(yearAgo, daysAgo(3, now));
    const expectedTs = orderTs + supplier.leadTimeDays * DAY;
    const roll = Math.random();
    if (roll < 0.08 && expectedTs < now) {
      makePo(supplier, chosen.map((p) => ({ product: p, qty: rand(10, 60) })), orderTs, 'draft');
    } else if (roll < 0.14 && expectedTs < now) {
      makePo(supplier, chosen.map((p) => ({ product: p, qty: rand(10, 60) })), orderTs, 'sent');
    } else if (roll < 0.22 && expectedTs < now) {
      const qtys = chosen.map(() => rand(10, 60));
      const received = qtys.map((q) => Math.round(q * rand(30, 70) / 100));
      makePo(
        supplier,
        chosen.map((p, idx) => ({ product: p, qty: qtys[idx] })),
        orderTs,
        'partially_received',
        Math.min(now, expectedTs + rand(-2, 4) * DAY),
        received
      );
    } else {
      const receivedTs = Math.min(now - DAY, expectedTs + rand(-3, 5) * DAY);
      makePo(supplier, chosen.map((p) => ({ product: p, qty: rand(10, 60) })), orderTs, 'received', Math.max(orderTs + DAY, receivedTs));
    }
  }

  // Sales (~270 more, on top of the ~28 story sales above ≈ 300 total).
  for (let i = 0; i < 270; i++) {
    const ts = weightedTimestamp(yearAgo, now - DAY);
    const nLines = rand(1, 5);
    const lineDefs: { product: Product; qty: number }[] = [];
    const usedIds = new Set<string>();
    for (let j = 0; j < nLines; j++) {
      const product = pick(products);
      if (usedIds.has(product._id)) continue;
      usedIds.add(product._id);
      lineDefs.push({ product, qty: rand(2, 12) });
    }
    if (lineDefs.length === 0) continue;
    const hasCustomer = Math.random() < 0.7;
    const customer = hasCustomer ? pick(customers) : undefined;
    const roll = Math.random();
    const status: Sale['status'] = roll < 0.04 ? 'cancelled' : roll < 0.08 ? 'refunded' : roll < 0.6 ? 'confirmed' : 'fulfilled';
    makeSale(lineDefs, ts, customer, status);
  }

  // Replay every queued sale/receipt in true chronological order — this is what fixes each
  // sale line's unitCost snapshot and each product's final costPrice (see comment above).
  replayLedgerEvents();

  // ---------------------------------------------------------------------
  // Final inventory correction for the near-stockout story products (a real
  // cycle-count adjustment, dated today, reconciling the ledger to the target).
  // ---------------------------------------------------------------------
  function correctTo(productId: string, target: number): void {
    const led = ledger.get(productId)!;
    const delta = target - led.qty;
    if (delta !== 0) {
      led.qty = target;
      const ts = now - DAY;
      stockMovements.push({
        _id: newId(),
        businessId,
        productId,
        location: 'default',
        type: 'adjustment',
        quantityDelta: delta,
        quantityAfter: target,
        unitCost: products.find((p) => p._id === productId)!.costPrice,
        reason: 'Cycle count adjustment',
        userId: owner._id,
        timestamp: iso(ts),
        createdAt: iso(ts),
        updatedAt: iso(ts),
      });
    }
  }
  correctTo(PRODUCT_STOCKOUT_ZERO._id, 0);
  correctTo(PRODUCT_STOCKOUT_AT_REORDER._id, PRODUCT_STOCKOUT_AT_REORDER.reorderPoint);
  correctTo(PRODUCT_VELOCITY_RISK._id, PRODUCT_VELOCITY_RISK.reorderPoint + 10);

  // Final inventory documents.
  const inventoryRecords: InventoryRecord[] = products.map((p) => ({
    _id: newId(),
    businessId,
    productId: p._id,
    location: 'default',
    quantityOnHand: Math.max(0, ledger.get(p._id)!.qty),
    quantityReserved: 0,
    createdAt: iso(yearAgo),
    updatedAt: nowIso,
  }));

  // ---------------------------------------------------------------------
  // Invoices + payments
  // ---------------------------------------------------------------------
  const invoices: Invoice[] = [];
  const payments: Payment[] = [];

  const invoiceableSales = sales.filter((s) => s.customerId && (s.status === 'confirmed' || s.status === 'fulfilled'));
  const shuffled = [...invoiceableSales].sort(() => Math.random() - 0.5);
  const toInvoice = shuffled.slice(0, Math.min(150, shuffled.length));

  function mkPayment(
    direction: 'in' | 'out',
    amount: number,
    ts: number,
    opts: { invoiceId?: string; purchaseOrderId?: string; customerId?: string; supplierId?: string }
  ): Payment {
    const p: Payment = {
      _id: newId(),
      businessId,
      direction,
      amount,
      date: iso(ts),
      method: pick(PAYMENT_METHODS) as PaymentMethod,
      invoiceId: opts.invoiceId,
      purchaseOrderId: opts.purchaseOrderId,
      customerId: opts.customerId,
      supplierId: opts.supplierId,
      createdAt: iso(ts),
      updatedAt: iso(ts),
    };
    payments.push(p);
    return p;
  }

  // Opening capital: the data model has no "starting bank balance" field, so
  // lib/financials.ts's getCurrentCashPosition() is purely cumulative (all-time cash in minus
  // all-time cash out). Without an opening injection a year of real operating cash flow reads as
  // deeply negative, which would look like a data bug rather than a real (if cash-tight) small
  // business. This one-time owner contribution, dated at the start of the simulated year, is the
  // seed data's stand-in for that missing concept — documented as a known limitation in NOTES.md.
  mkPayment('in', 15000000, daysAgo(364, now), {});

  let overdueCount = 0;
  toInvoice.forEach((sale, idx) => {
    const customer = customers.find((c) => c._id === sale.customerId)!;
    const issueTs = new Date(sale.date).getTime() + rand(0, 2) * DAY;
    const termsDays = customer.paymentTermsDays || 30;
    const dueTs = issueTs + termsDays * DAY;

    const invoiceLineItems = sale.lineItems.map((l) => ({
      productId: l.productId,
      name: l.name,
      qty: l.qty,
      unitPrice: l.unitPrice,
      discount: l.discount,
      taxRate: l.taxRate,
      lineTotal: l.lineTotal,
    }));
    const total = sale.grandTotal;

    // Force at least 10 clearly-overdue invoices (past due date, balance outstanding).
    const forceOverdue = overdueCount < 10 && dueTs < now - 5 * DAY;
    let amountPaid: number;
    let status: Invoice['status'];
    if (forceOverdue) {
      amountPaid = Math.random() < 0.5 ? 0 : Math.round(total * rand(20, 60) / 100);
      status = amountPaid > 0 ? 'partially_paid' : 'sent';
      overdueCount++;
    } else {
      const roll = Math.random();
      if (roll < 0.65) {
        amountPaid = total;
        status = 'paid';
      } else if (roll < 0.85) {
        amountPaid = Math.round(total * rand(20, 80) / 100);
        status = 'partially_paid';
      } else {
        amountPaid = 0;
        status = 'sent';
      }
    }

    const invoice: Invoice = {
      _id: newId(),
      businessId,
      invoiceNumber: `INV-${1000 + idx}`,
      customerId: customer._id,
      saleId: sale._id,
      lineItems: invoiceLineItems,
      subtotal: sale.subtotal,
      discountTotal: sale.discountTotal,
      taxTotal: sale.taxTotal,
      total,
      amountPaid,
      amountDue: total - amountPaid,
      issueDate: iso(issueTs),
      dueDate: iso(dueTs),
      status,
      terms: 'Net 30. Thank you for your business.',
      reminderHistory: [{ sentAt: iso(issueTs), method: 'email' }],
      createdAt: iso(issueTs),
      updatedAt: nowIso,
    };
    invoices.push(invoice);

    if (amountPaid > 0) {
      const payTs = Math.min(now - DAY, issueTs + rand(1, Math.max(2, termsDays)) * DAY);
      mkPayment('in', amountPaid, payTs, { invoiceId: invoice._id, customerId: customer._id });
    }
  });

  // Payments against purchase orders (a subset, direction out).
  const paidPoCandidates = purchaseOrders.filter((po) => po.status === 'received' || po.status === 'partially_received');
  for (const po of paidPoCandidates.slice(0, 45)) {
    const pct = pick([100, 100, 100, 60, 0]);
    const amount = Math.round((po.total * pct) / 100);
    if (amount <= 0) continue;
    po.amountPaid = amount;
    const payTs = Math.min(now - DAY, new Date(po.receivedDate ?? po.createdAt).getTime() + rand(1, po.status === 'received' ? 20 : 10) * DAY);
    mkPayment('out', amount, payTs, { purchaseOrderId: po._id, supplierId: po.supplierId });
  }

  // ---------------------------------------------------------------------
  // Expenses
  // ---------------------------------------------------------------------
  const expenses: Expense[] = [];
  function addExpense(category: string, amount: number, ts: number, opts: Partial<Expense> = {}): void {
    expenses.push({
      _id: newId(),
      businessId,
      amount,
      date: iso(ts),
      category,
      vendor: opts.vendor,
      paymentMethod: opts.paymentMethod ?? pick(PAYMENT_METHODS),
      recurring: opts.recurring ?? false,
      recurrenceFrequency: opts.recurrenceFrequency,
      nextOccurrenceDate: opts.nextOccurrenceDate,
      parentExpenseId: opts.parentExpenseId,
      taxDeductible: opts.taxDeductible ?? true,
      approvalStatus: 'approved',
      createdAt: iso(ts),
      updatedAt: iso(ts),
    });
  }

  // Sized relative to the store's simulated sales volume (~$250-350k/year) so total opex
  // reads as a real, moderately cash-tight small business rather than a runaway loss.
  const monthlyCategoryRanges: Record<string, [number, number]> = {
    Utilities: [30000, 60000],
    Payroll: [350000, 550000],
    'Vehicle & Fuel': [15000, 45000],
    'Shipping & Freight': [8000, 60000],
    'Office Supplies': [3000, 15000],
    Misc: [2000, 25000],
  };
  for (let m = 0; m < 12; m++) {
    const monthStart = daysAgo(365 - m * 30, now);
    for (const [category, [lo, hi]] of Object.entries(monthlyCategoryRanges)) {
      const entries = rand(1, 2);
      for (let e = 0; e < entries; e++) {
        addExpense(category, rand(lo, hi), monthStart + rand(0, 27) * DAY);
      }
    }
  }

  // Marketing: deliberate period-over-period spike (prior 30d ~$400, last 30d ~$800).
  for (let i = 0; i < 4; i++) addExpense('Marketing', rand(9000, 11000), daysAgo(rand(31, 58), now));
  for (let i = 0; i < 4; i++) addExpense('Marketing', rand(18000, 22000), daysAgo(rand(1, 28), now));
  for (let m = 2; m < 10; m++) addExpense('Marketing', rand(10000, 20000), daysAgo(365 - m * 30, now) + rand(0, 20) * DAY);

  // Recurring templates: Rent (monthly), Software (monthly), Insurance (quarterly).
  // Historical occurrences for the past 11 months, plus a live template whose next
  // occurrence is due (a couple already past-due) so lib/expenses.ts's on-read
  // generation has real work to do the first time the app is opened.
  for (let m = 1; m <= 11; m++) {
    addExpense('Rent', 220000, daysAgo(365 - m * 30, now), { vendor: 'Elm Street Properties', recurring: false });
    addExpense('Software', rand(24000, 29000), daysAgo(365 - m * 30, now), { vendor: 'Various SaaS', recurring: false });
  }
  for (let q = 1; q <= 3; q++) {
    addExpense('Insurance', rand(85000, 95000), daysAgo(365 - q * 90, now), { vendor: 'Heartland Business Insurance', recurring: false });
  }
  addExpense('Rent', 220000, daysAgo(30, now), {
    vendor: 'Elm Street Properties',
    recurring: true,
    recurrenceFrequency: 'monthly',
    nextOccurrenceDate: iso(now - 2 * DAY), // already due — exercises on-read generation
  });
  addExpense('Software', 26500, daysAgo(28, now), {
    vendor: 'Various SaaS',
    recurring: true,
    recurrenceFrequency: 'monthly',
    nextOccurrenceDate: iso(now + 3 * DAY),
  });
  addExpense('Insurance', 91000, daysAgo(20, now), {
    vendor: 'Heartland Business Insurance',
    recurring: true,
    recurrenceFrequency: 'quarterly',
    nextOccurrenceDate: iso(now + 70 * DAY),
  });

  // ---------------------------------------------------------------------
  // Employees
  // ---------------------------------------------------------------------
  const employeeDefs: Array<[string, string, string, number]> = [
    ['Maria Chen', 'Owner / General Manager', 'Management', 9500000],
    ['David Kim', 'Store Manager', 'Management', 6200000],
    ['Jasmine Ortiz', 'Sales Associate', 'Sales Floor', 3400000],
    ['Tyrell Brooks', 'Sales Associate', 'Sales Floor', 3300000],
    ['Priya Nair', 'Staff Accountant', 'Finance', 5400000],
    ['Marcus Webb', 'Warehouse Lead', 'Warehouse', 4200000],
    ['Nina Alvarado', 'Inventory Clerk', 'Warehouse', 3600000],
    ['Oliver Frost', 'Delivery Driver', 'Logistics', 3800000],
    ['Sara Lindqvist', 'Cashier', 'Sales Floor', 3100000],
    ['Ben Osei', 'Customer Service', 'Sales Floor', 3300000],
  ];
  const employees: Employee[] = employeeDefs.map(([name, role, dept, salary], i) => ({
    _id: newId(),
    businessId,
    name,
    email: `${name.toLowerCase().replace(/\s+/g, '.')}@northsidehardware.example`,
    role,
    department: dept,
    employmentType: 'full_time',
    salary,
    payFrequency: 'monthly',
    startDate: iso(daysAgo(rand(60, 1200), now)),
    status: 'active',
    linkedUserId: i === 0 ? owner._id : i === 1 ? manager._id : i === 4 ? accountant._id : undefined,
    permissions: [],
    createdAt: iso(daysAgo(rand(60, 1200), now)),
    updatedAt: nowIso,
  }));

  // ---------------------------------------------------------------------
  // Tasks
  // ---------------------------------------------------------------------
  const taskTitles = [
    'Restock endcap displays for weekend sale',
    'Follow up with quiet contractor accounts',
    'Reconcile cash drawer discrepancy from Tuesday',
    'Schedule quarterly inventory cycle count',
    'Negotiate better terms with Ironclad Distributors',
    'Update price tags after spring price changes',
    'Onboard new POS terminal at register 2',
    'Review overdue invoices over $500',
    'Plan Memorial Day weekend staffing',
    'Repair leak in warehouse roof',
    'Order more safety glasses — running low',
    'Set up loyalty program for repeat customers',
    'Audit supplier invoices against received POs',
    'Train new cashier on return policy',
    'Design new flyer for lawn & garden season',
    'Call BrightBolt about late fastener shipment',
    'Update website with new product photos',
    'Renew annual business insurance policy',
    'Clean and organize back stockroom',
    'Investigate margin drop on tape measures',
    'Send reminder emails to overdue accounts',
    'Evaluate hiring a second delivery driver',
    'Fix broken shelf in aisle 4',
    'Prepare Q3 financial summary for owner',
    'Set reorder points for new SKUs',
    'Coordinate with landlord on parking lot repaving',
    'Review employee schedule for next month',
    'Test backup generator for register power outage',
    'Update supplier contact list',
    'Plan end-of-season clearance for paint supplies',
  ];
  const allAssignees = [owner._id, manager._id, staff1._id, staff2._id, accountant._id];
  const tasks: Task[] = taskTitles.map((title, i) => {
    const status = pick(['todo', 'todo', 'in_progress', 'in_progress', 'blocked', 'done', 'done'] as const);
    const hasSubtasks = i % 4 === 0;
    return {
      _id: newId(),
      businessId,
      title,
      description: undefined,
      status,
      priority: pick(['low', 'medium', 'medium', 'high', 'urgent'] as const),
      assigneeId: pick(allAssignees),
      dueDate: iso(now + rand(-10, 30) * DAY),
      subtasks: hasSubtasks
        ? [
            { id: newId(), title: 'Confirm details', done: true },
            { id: newId(), title: 'Take action', done: status === 'done' },
          ]
        : [],
      comments:
        i % 6 === 0
          ? [{ id: newId(), userId: pick(allAssignees), text: 'Working on this now.', createdAt: iso(now - DAY) }]
          : [],
      linkedEntity: i === 19 ? { type: 'product', id: PRODUCT_MARGIN_DECLINE._id } : undefined,
      createdBy: owner._id,
      createdAt: iso(daysAgo(rand(1, 60), now)),
      updatedAt: nowIso,
    };
  });

  // ---------------------------------------------------------------------
  // Persist everything
  // ---------------------------------------------------------------------
  await insertAll(db, COLLECTIONS.suppliers, suppliers);
  await insertAll(db, COLLECTIONS.products, products);
  await insertAll(db, COLLECTIONS.customers, customers);
  await insertAll(db, COLLECTIONS.purchaseOrders, purchaseOrders);
  await insertAll(db, COLLECTIONS.sales, sales);
  await insertAll(db, COLLECTIONS.stockMovements, stockMovements);
  await insertAll(db, COLLECTIONS.inventory, inventoryRecords);
  await insertAll(db, COLLECTIONS.invoices, invoices);
  await insertAll(db, COLLECTIONS.payments, payments);
  await insertAll(db, COLLECTIONS.expenses, expenses);
  await insertAll(db, COLLECTIONS.employees, employees);
  await insertAll(db, COLLECTIONS.tasks, tasks);

  console.log('\nSeed complete.');
  console.log('---------------------------------------------');
  console.log(`Business:        ${business.name} (${businessId})`);
  console.log(`Users:           ${users.length}`);
  console.log(`Suppliers:       ${suppliers.length}`);
  console.log(`Products:        ${products.length}`);
  console.log(`Customers:       ${customers.length}`);
  console.log(`Purchase orders: ${purchaseOrders.length}`);
  console.log(`Sales:           ${sales.length}`);
  console.log(`Stock movements: ${stockMovements.length}`);
  console.log(`Invoices:        ${invoices.length} (${overdueCount} forced overdue)`);
  console.log(`Payments:        ${payments.length}`);
  console.log(`Expenses:        ${expenses.length}`);
  console.log(`Employees:       ${employees.length}`);
  console.log(`Tasks:           ${tasks.length}`);
  console.log('---------------------------------------------');
  console.log('Demo login: demo@smecopilot.app / demo1234');
  console.log('---------------------------------------------');
  console.log('Baked-in insight stories:');
  console.log(`  1. Margin decline  -> ${PRODUCT_MARGIN_DECLINE.name} (${PRODUCT_MARGIN_DECLINE.sku}), cost rose ~${Math.round((costMultiplier - 1) * 100)}% 20 days ago`);
  console.log(`  2. Late supplier   -> ${SUPPLIER_LATE.name}, 4 recent deliveries 6-12 days late`);
  console.log(`  3. Quiet customer  -> ${CUSTOMER_QUIET.name}, ~25-day cadence, no order in 100+ days`);
  console.log(`  4. Out of stock    -> ${PRODUCT_STOCKOUT_ZERO.name} (${PRODUCT_STOCKOUT_ZERO.sku}), available = 0`);
  console.log(`  5. At reorder pt.  -> ${PRODUCT_STOCKOUT_AT_REORDER.name} (${PRODUCT_STOCKOUT_AT_REORDER.sku}), available = reorder point`);
  console.log(`  6. Selling fast    -> ${PRODUCT_VELOCITY_RISK.name} (${PRODUCT_VELOCITY_RISK.sku}), high recent velocity`);
  console.log(`  7. Expense spike   -> Marketing category, ~2x last 30 days vs prior 30 days`);
  console.log('---------------------------------------------');
}

async function insertAll<T extends { _id: string }>(db: Db, collectionName: string, docs: T[]): Promise<void> {
  if (docs.length === 0) return;
  await db.collection(collectionName).insertMany(docs as unknown as Document[]);
}

if (require.main === module) {
  const force = process.argv.includes('--force');
  runSeed(force)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
