import { col, COLLECTIONS } from './db';
import { newId } from './id';
import { getCashFlowProjection } from './financials';
import { listInventory } from './inventory';
import { formatMoney } from './money';
import { getBusiness } from './business';
import type {
  Business,
  Customer,
  Insight,
  InsightSeverity,
  Product,
  PurchaseOrder,
  Sale,
  Supplier,
} from './types';

interface Candidate {
  type: string;
  dedupeKey: string;
  severity: InsightSeverity;
  title: string;
  body: string;
  data: Record<string, unknown>;
  suggestedAction: Insight['suggestedAction'];
}

const DAY = 86400000;

async function unitsAndRevenueByProduct(
  businessId: string,
  fromMs: number,
  toMs: number
): Promise<Map<string, { units: number; revenue: number; cogs: number }>> {
  const sales = await col<Sale>(COLLECTIONS.sales);
  const rows = await sales
    .aggregate<{ _id: string; units: number; revenue: number; cogs: number }>([
      {
        $match: {
          businessId,
          status: { $in: ['confirmed', 'fulfilled'] },
          date: { $gte: new Date(fromMs).toISOString(), $lt: new Date(toMs).toISOString() },
        },
      },
      { $unwind: '$lineItems' },
      {
        $group: {
          _id: '$lineItems.productId',
          units: { $sum: '$lineItems.qty' },
          revenue: { $sum: '$lineItems.lineTotal' },
          cogs: { $sum: { $multiply: ['$lineItems.qty', '$lineItems.unitCost'] } },
        },
      },
    ])
    .toArray();
  return new Map(rows.map((r) => [r._id, { units: r.units, revenue: r.revenue, cogs: r.cogs }]));
}

// --- Rule 1 & 8: reorder point + about-to-stock-out ---------------------------------

async function stockRules(businessId: string, business: Business): Promise<Candidate[]> {
  const now = Date.now();
  // None of these five reads depend on each other's result — run them together instead of
  // chaining five sequential round trips.
  const [trackable, last30, inventoryRecords, allSuppliers, openPOs] = await Promise.all([
    col<Product>(COLLECTIONS.products).then((c) => c.find({ businessId, trackInventory: true, status: 'active' }).toArray()),
    unitsAndRevenueByProduct(businessId, now - 30 * DAY, now),
    listInventory(businessId),
    col<Supplier>(COLLECTIONS.suppliers).then((c) => c.find({ businessId }).toArray()),
    col<PurchaseOrder>(COLLECTIONS.purchaseOrders).then((c) =>
      c.find({ businessId, status: { $in: ['draft', 'sent', 'partially_received'] } }).toArray()
    ),
  ]);
  if (trackable.length === 0) return [];

  const availableByProduct = new Map<string, number>();
  for (const rec of inventoryRecords) {
    availableByProduct.set(rec.productId, (availableByProduct.get(rec.productId) ?? 0) + rec.available);
  }

  const supplierByProduct = new Map<string, Supplier>();
  for (const s of allSuppliers) for (const pid of s.productIds) if (!supplierByProduct.has(pid)) supplierByProduct.set(pid, s);

  const openPoDaysByProduct = new Map<string, number>();
  for (const po of openPOs) {
    if (!po.expectedDate) continue;
    const daysUntil = Math.ceil((new Date(po.expectedDate).getTime() - now) / DAY);
    for (const line of po.lineItems) {
      if (line.qtyReceived >= line.qtyOrdered) continue;
      const existing = openPoDaysByProduct.get(line.productId);
      if (existing === undefined || daysUntil < existing) openPoDaysByProduct.set(line.productId, daysUntil);
    }
  }

  const candidates: Candidate[] = [];
  for (const product of trackable) {
    const available = availableByProduct.get(product._id) ?? 0;
    const velocity = (last30.get(product._id)?.units ?? 0) / 30;
    const supplier = supplierByProduct.get(product._id);
    const leadTime = supplier?.leadTimeDays ?? 7;

    if (available <= product.reorderPoint) {
      const suggestedQty = Math.max(1, Math.ceil(velocity * (leadTime + 14)), product.reorderPoint * 2 - available);
      candidates.push({
        type: 'low_stock',
        dedupeKey: product._id,
        severity: available <= 0 ? 'critical' : 'warning',
        title: `Reorder ${product.name}`,
        body:
          available <= 0
            ? `${product.name} is out of stock (0 available). At recent sales velocity of ${velocity.toFixed(1)}/day, order about ${suggestedQty} units${supplier ? ` from ${supplier.name} (${leadTime}-day lead time)` : ''}.`
            : `${product.name} has ${available} left, at or below its reorder point of ${product.reorderPoint}. Order about ${suggestedQty} units${supplier ? ` from ${supplier.name} (${leadTime}-day lead time)` : ''} to avoid a stockout.`,
        data: { productId: product._id, available, reorderPoint: product.reorderPoint, suggestedQty, velocity },
        suggestedAction: {
          type: 'create_purchase_order',
          label: `Create PO for ${suggestedQty} units`,
          payload: { productId: product._id, supplierId: supplier?._id, qty: suggestedQty },
        },
      });
      continue;
    }

    if (velocity > 0) {
      const daysOfStockLeft = available / velocity;
      const poCoverageDays = openPoDaysByProduct.get(product._id);
      const covered = poCoverageDays !== undefined && poCoverageDays <= daysOfStockLeft;
      if (daysOfStockLeft <= 14 && !covered) {
        const suggestedQty = Math.max(1, Math.ceil(velocity * (leadTime + 14)));
        candidates.push({
          type: 'stockout_risk',
          dedupeKey: product._id,
          severity: daysOfStockLeft <= 7 ? 'warning' : 'opportunity',
          title: `${product.name} is selling fast and will run out soon`,
          body: `${product.name} is selling at ${velocity.toFixed(1)} units/day. At ${available} units on hand, it will run out in about ${Math.floor(daysOfStockLeft)} days${supplier ? ` — before a new order from ${supplier.name} would typically arrive (${leadTime}-day lead time)` : ''}.`,
          data: { productId: product._id, available, velocity, daysOfStockLeft: Math.floor(daysOfStockLeft) },
          suggestedAction: {
            type: 'create_purchase_order',
            label: `Create PO for ${suggestedQty} units`,
            payload: { productId: product._id, supplierId: supplier?._id, qty: suggestedQty },
          },
        });
      }
    }
  }
  return candidates;
}

// --- Rule 2: overdue invoices ------------------------------------------------------

async function overdueInvoiceRules(businessId: string, business: Business): Promise<Candidate[]> {
  const invoices = await col(COLLECTIONS.invoices);
  const overdue = await invoices
    .find({ businessId, amountDue: { $gt: 0 }, status: { $ne: 'void' }, dueDate: { $lt: new Date().toISOString() } })
    .sort({ amountDue: -1 })
    .limit(5)
    .toArray();

  if (overdue.length === 0) return [];
  const customers = await col<Customer>(COLLECTIONS.customers);
  const custDocs = await customers.find({ _id: { $in: overdue.map((i: any) => i.customerId) } }).toArray();
  const nameMap = new Map(custDocs.map((c) => [c._id, c.name]));

  return overdue.map((inv: any) => {
    const daysOverdue = Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / DAY);
    return {
      type: 'overdue_invoice',
      dedupeKey: inv._id,
      severity: daysOverdue > 30 ? 'critical' : 'warning',
      title: `${nameMap.get(inv.customerId) ?? 'A customer'} is ${daysOverdue} days late on ${inv.invoiceNumber}`,
      body: `Invoice ${inv.invoiceNumber} for ${formatMoney(inv.amountDue, business.currency)} is ${daysOverdue} days overdue. Consider sending a reminder.`,
      data: { invoiceId: inv._id, amountDue: inv.amountDue, daysOverdue },
      suggestedAction: {
        type: 'send_invoice_reminder',
        label: 'Send reminder',
        payload: { invoiceId: inv._id },
      },
    } satisfies Candidate;
  });
}

// --- Rule 3: cash runway ------------------------------------------------------------

async function cashRunwayRule(businessId: string, business: Business): Promise<Candidate[]> {
  const projection = await getCashFlowProjection(businessId);
  if (projection.runwayMonths === null || projection.runwayMonths >= 3) return [];

  return [
    {
      type: 'cash_runway',
      dedupeKey: 'runway',
      severity: projection.runwayMonths < 1 ? 'critical' : 'warning',
      title: `Cash runway is ${projection.runwayMonths} months`,
      body: `At the current burn rate of ${formatMoney(projection.averageMonthlyBurn, business.currency)}/month, cash on hand (${formatMoney(projection.currentCash, business.currency)}) covers about ${projection.runwayMonths} months. Expected collections over the next ${projection.horizonDays} days are ${formatMoney(projection.weightedExpectedInflows, business.currency)}, against ${formatMoney(projection.scheduledOutflows, business.currency)} in scheduled outflows.`,
      data: projection as unknown as Record<string, unknown>,
      suggestedAction: { type: 'view_report', label: 'View cash flow', payload: { report: 'cash-flow' } },
    },
  ];
}

// --- Rule 4: margin drop -------------------------------------------------------------

async function marginDropRule(businessId: string): Promise<Candidate[]> {
  const now = Date.now();
  const [last30, prev30] = await Promise.all([
    unitsAndRevenueByProduct(businessId, now - 30 * DAY, now),
    unitsAndRevenueByProduct(businessId, now - 60 * DAY, now - 30 * DAY),
  ]);
  const products = await col<Product>(COLLECTIONS.products);
  const dropped = [...last30.entries()].filter(([productId, curr]) => {
    const prev = prev30.get(productId);
    if (!prev || prev.units < 3 || curr.units < 3) return false;
    const currMargin = curr.revenue > 0 ? (curr.revenue - curr.cogs) / curr.revenue : 0;
    const prevMargin = prev.revenue > 0 ? (prev.revenue - prev.cogs) / prev.revenue : 0;
    return (prevMargin - currMargin) * 100 >= 8;
  });
  if (dropped.length === 0) return [];

  const productDocs = await products.find({ _id: { $in: dropped.map(([productId]) => productId) }, businessId }).toArray();
  const productMap = new Map(productDocs.map((p) => [p._id, p]));

  const candidates: Candidate[] = [];
  for (const [productId, curr] of dropped) {
    const prev = prev30.get(productId)!;
    const currMargin = curr.revenue > 0 ? (curr.revenue - curr.cogs) / curr.revenue : 0;
    const prevMargin = prev.revenue > 0 ? (prev.revenue - prev.cogs) / prev.revenue : 0;
    const dropPts = (prevMargin - currMargin) * 100;
    const product = productMap.get(productId);
    const currUnitCost = curr.cogs / curr.units;
    const prevUnitCost = prev.cogs / prev.units;
    candidates.push({
      type: 'margin_drop',
      dedupeKey: productId,
      severity: dropPts >= 15 ? 'critical' : 'warning',
      title: `${product?.name ?? 'A product'}'s margin dropped ${dropPts.toFixed(1)} points`,
      body: `Gross margin on ${product?.name ?? 'this product'} fell from ${(prevMargin * 100).toFixed(1)}% to ${(currMargin * 100).toFixed(1)}% over the last 30 days. Average unit cost rose from ${prevUnitCost.toFixed(0)} to ${currUnitCost.toFixed(0)} (in minor currency units) while the sale price held steady.`,
      data: { productId, currMargin, prevMargin, currUnitCost, prevUnitCost },
      suggestedAction: { type: 'review_pricing', label: 'Review pricing', payload: { productId } },
    });
  }
  return candidates;
}

// --- Rule 5: expense category spike ---------------------------------------------------

async function expenseSpikeRule(businessId: string, business: Business): Promise<Candidate[]> {
  const now = Date.now();
  const expenses = await col(COLLECTIONS.expenses);
  const agg = async (fromMs: number, toMs: number) =>
    expenses
      .aggregate<{ _id: string; total: number }>([
        { $match: { businessId, date: { $gte: new Date(fromMs).toISOString(), $lt: new Date(toMs).toISOString() } } },
        { $group: { _id: '$category', total: { $sum: '$amount' } } },
      ])
      .toArray();

  const [curr, prev] = await Promise.all([agg(now - 30 * DAY, now), agg(now - 60 * DAY, now - 30 * DAY)]);
  const prevMap = new Map(prev.map((p) => [p._id, p.total]));
  const candidates: Candidate[] = [];

  for (const c of curr) {
    const prevTotal = prevMap.get(c._id) ?? 0;
    if (prevTotal < 1000 || c.total < 1000) continue; // ignore noise on tiny categories
    const pctChange = ((c.total - prevTotal) / prevTotal) * 100;
    if (pctChange >= 30) {
      candidates.push({
        type: 'expense_spike',
        dedupeKey: c._id,
        severity: pctChange >= 75 ? 'warning' : 'opportunity',
        title: `${c._id} expenses are up ${pctChange.toFixed(0)}%`,
        body: `Spending on "${c._id}" was ${formatMoney(c.total, business.currency)} in the last 30 days, up from ${formatMoney(prevTotal, business.currency)} the 30 days before — a ${pctChange.toFixed(0)}% increase.`,
        data: { category: c._id, current: c.total, previous: prevTotal, pctChange },
        suggestedAction: { type: 'view_report', label: 'View expenses', payload: { report: 'expenses' } },
      });
    }
  }
  return candidates;
}

// --- Rule 6: quiet customer ------------------------------------------------------------

async function quietCustomerRule(businessId: string): Promise<Candidate[]> {
  const sales = await col<Sale>(COLLECTIONS.sales);
  const rows = await sales
    .aggregate<{ _id: string; dates: string[] }>([
      { $match: { businessId, status: { $in: ['confirmed', 'fulfilled'] }, customerId: { $exists: true } } },
      { $group: { _id: '$customerId', dates: { $push: '$date' } } },
    ])
    .toArray();

  const now = Date.now();
  const quiet: Array<{ customerId: string; avgGap: number; sinceLast: number }> = [];
  for (const row of rows) {
    if (row.dates.length < 3) continue;
    const sorted = row.dates.map((d) => new Date(d).getTime()).sort((a, b) => a - b);
    const gaps = sorted.slice(1).map((t, i) => t - sorted[i]);
    const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const lastOrder = sorted[sorted.length - 1];
    const sinceLast = now - lastOrder;
    if (sinceLast > avgGap * 2 && sinceLast > 30 * DAY) quiet.push({ customerId: row._id, avgGap, sinceLast });
  }
  if (quiet.length === 0) return [];

  const customers = await col<Customer>(COLLECTIONS.customers);
  const customerDocs = await customers
    .find({ _id: { $in: quiet.map((q) => q.customerId) }, businessId, status: 'active' })
    .toArray();
  const customerMap = new Map(customerDocs.map((c) => [c._id, c]));

  const candidates: Candidate[] = [];
  for (const q of quiet) {
    const customer = customerMap.get(q.customerId);
    if (!customer) continue;
    candidates.push({
      type: 'quiet_customer',
      dedupeKey: q.customerId,
      severity: 'opportunity',
      title: `${customer.name} has gone quiet`,
      body: `${customer.name} used to order roughly every ${Math.round(q.avgGap / DAY)} days but hasn't ordered in ${Math.round(q.sinceLast / DAY)} days. Consider reaching out.`,
      data: { customerId: q.customerId, avgGapDays: Math.round(q.avgGap / DAY), daysSinceLastOrder: Math.round(q.sinceLast / DAY) },
      suggestedAction: { type: 'none', label: 'View customer' },
    });
  }
  return candidates;
}

// --- Rule 7: late supplier ---------------------------------------------------------------

async function lateSupplierRule(businessId: string): Promise<Candidate[]> {
  const pos = await col<PurchaseOrder>(COLLECTIONS.purchaseOrders);
  const received = await pos.find({ businessId, status: 'received', receivedDate: { $exists: true }, expectedDate: { $exists: true } }).toArray();
  const bySupplier = new Map<string, { total: number; late: number }>();
  for (const po of received) {
    const entry = bySupplier.get(po.supplierId) ?? { total: 0, late: 0 };
    entry.total += 1;
    if (new Date(po.receivedDate as string).getTime() > new Date(po.expectedDate as string).getTime()) entry.late += 1;
    bySupplier.set(po.supplierId, entry);
  }

  const late = [...bySupplier.entries()].filter(([, stats]) => {
    if (stats.total < 3) return false;
    return ((stats.total - stats.late) / stats.total) * 100 < 70;
  });
  if (late.length === 0) return [];

  const suppliers = await col<Supplier>(COLLECTIONS.suppliers);
  const supplierDocs = await suppliers.find({ _id: { $in: late.map(([supplierId]) => supplierId) }, businessId }).toArray();
  const supplierMap = new Map(supplierDocs.map((s) => [s._id, s]));

  const candidates: Candidate[] = [];
  for (const [supplierId, stats] of late) {
    const onTimeRate = ((stats.total - stats.late) / stats.total) * 100;
    const supplier = supplierMap.get(supplierId);
    candidates.push({
      type: 'late_supplier',
      dedupeKey: supplierId,
      severity: onTimeRate < 50 ? 'warning' : 'opportunity',
      title: `${supplier?.name ?? 'A supplier'} is often late`,
      body: `${supplier?.name ?? 'This supplier'} delivered late on ${stats.late} of ${stats.total} recent orders (${onTimeRate.toFixed(0)}% on-time). Consider padding lead times or discussing this with them.`,
      data: { supplierId, total: stats.total, late: stats.late, onTimeRate },
      suggestedAction: { type: 'none', label: 'View supplier' },
    });
  }
  return candidates;
}

// --- Orchestration --------------------------------------------------------------------

export async function computeInsightCandidates(businessId: string): Promise<Candidate[]> {
  const business = await getBusiness(businessId);
  if (!business) return [];
  const results = await Promise.all([
    stockRules(businessId, business),
    overdueInvoiceRules(businessId, business),
    cashRunwayRule(businessId, business),
    marginDropRule(businessId),
    expenseSpikeRule(businessId, business),
    quietCustomerRule(businessId),
    lateSupplierRule(businessId),
  ]);
  return results.flat();
}

const SEVERITY_RANK: Record<InsightSeverity, number> = { critical: 0, warning: 1, opportunity: 2 };

const insightsCache = new Map<string, { value: Insight[]; expiresAt: number }>();
const INSIGHTS_CACHE_TTL_MS = 60_000;

export function invalidateInsightsCache(businessId: string): void {
  insightsCache.delete(businessId);
}

/**
 * Recomputes insights and upserts them, preserving user decisions (accepted/dismissed) on
 * unchanged items. This is called on every dashboard/copilot/inventory page load, and the
 * underlying computation runs several aggregations plus writes — short-lived per-business
 * cache so a burst of page views doesn't recompute and re-persist on every single one.
 * Call `invalidateInsightsCache` after any direct write to an insight (accept/dismiss/snooze)
 * so the change is reflected immediately instead of waiting out the TTL.
 */
export async function refreshInsights(businessId: string): Promise<Insight[]> {
  const cached = insightsCache.get(businessId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const result = await recomputeAndPersistInsights(businessId);
  insightsCache.set(businessId, { value: result, expiresAt: Date.now() + INSIGHTS_CACHE_TTL_MS });
  return result;
}

async function recomputeAndPersistInsights(businessId: string): Promise<Insight[]> {
  const candidates = await computeInsightCandidates(businessId);
  const insights = await col<Insight>(COLLECTIONS.insights);
  const now = new Date().toISOString();

  const liveKeys = new Set(candidates.map((c) => `${c.type}:${c.dedupeKey}`));
  const existingDocs = await insights.find({ businessId }).toArray();
  const existingByKey = new Map(existingDocs.map((d) => [`${d.type}:${d.data.dedupeKey}`, d]));

  for (const candidate of candidates) {
    const key = `${candidate.type}:${candidate.dedupeKey}`;
    const existing = existingByKey.get(key);
    const snoozeExpired = existing?.status === 'snoozed' && existing.snoozedUntil && new Date(existing.snoozedUntil) < new Date();

    if (existing && existing.status !== 'dismissed' && !(existing.status === 'accepted')) {
      await insights.updateOne(
        { _id: existing._id },
        {
          $set: {
            severity: candidate.severity,
            title: candidate.title,
            body: candidate.body,
            data: { ...candidate.data, dedupeKey: candidate.dedupeKey },
            suggestedAction: candidate.suggestedAction,
            generatedAt: now,
            updatedAt: now,
            ...(snoozeExpired ? { status: 'new', snoozedUntil: undefined } : {}),
          },
        }
      );
    } else if (!existing) {
      const doc: Insight = {
        _id: newId(),
        businessId,
        type: candidate.type,
        severity: candidate.severity,
        title: candidate.title,
        body: candidate.body,
        data: { ...candidate.data, dedupeKey: candidate.dedupeKey },
        suggestedAction: candidate.suggestedAction,
        status: 'new',
        generatedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      await insights.insertOne(doc);
    }
    // existing && (dismissed || accepted): leave the user's decision alone, don't resurface.
  }

  // Retire stale "new" insights whose underlying condition no longer holds.
  const staleIds = existingDocs.filter((d) => d.status === 'new' && !liveKeys.has(`${d.type}:${d.data.dedupeKey}`)).map((d) => d._id);
  if (staleIds.length > 0) await insights.deleteMany({ _id: { $in: staleIds }, businessId });

  const all = await insights.find({ businessId }).toArray();
  return all.sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.generatedAt.localeCompare(a.generatedAt)
  );
}
