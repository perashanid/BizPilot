import { col, COLLECTIONS } from './db';
import type { Expense, Invoice, Payment, PurchaseOrder, Sale, Supplier } from './types';

export interface DateRange {
  from: string; // ISO date, inclusive
  to: string; // ISO date, inclusive
}

function rangeFilter(field: string, range: DateRange): Record<string, unknown> {
  return { [field]: { $gte: range.from, $lte: range.to } };
}

const REVENUE_SALE_STATUSES = ['confirmed', 'fulfilled'];

// ---------------------------------------------------------------------------
// Profit & Loss — the single source of truth. Dashboard, reports, and the
// copilot all call this so the numbers always reconcile.
// ---------------------------------------------------------------------------

export interface ProfitLoss {
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPercent: number;
  expenses: number;
  netProfit: number;
  netMarginPercent: number;
}

export async function getProfitLoss(businessId: string, range: DateRange): Promise<ProfitLoss> {
  const sales = await col<Sale>(COLLECTIONS.sales);
  const [salesAgg] = await sales
    .aggregate<{ revenue: number; cogs: number }>([
      { $match: { businessId, status: { $in: REVENUE_SALE_STATUSES }, ...rangeFilter('date', range) } },
      { $unwind: '$lineItems' },
      {
        $group: {
          _id: null,
          revenue: { $sum: '$lineItems.lineTotal' },
          cogs: { $sum: { $multiply: ['$lineItems.qty', '$lineItems.unitCost'] } },
        },
      },
    ])
    .toArray();

  const expenses = await col<Expense>(COLLECTIONS.expenses);
  const [expenseAgg] = await expenses
    .aggregate<{ total: number }>([
      { $match: { businessId, ...rangeFilter('date', range) } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ])
    .toArray();

  const revenue = salesAgg?.revenue ?? 0;
  const cogs = salesAgg?.cogs ?? 0;
  const expenseTotal = expenseAgg?.total ?? 0;
  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - expenseTotal;

  return {
    revenue,
    cogs,
    grossProfit,
    grossMarginPercent: revenue > 0 ? round1((grossProfit / revenue) * 100) : 0,
    expenses: expenseTotal,
    netProfit,
    netMarginPercent: revenue > 0 ? round1((netProfit / revenue) * 100) : 0,
  };
}

export interface PeriodPoint {
  period: string; // e.g. "2026-01" or "2026-01-05"
  revenue: number;
  expenses: number;
  profit: number;
}

export async function getRevenueVsExpensesByPeriod(
  businessId: string,
  range: DateRange,
  granularity: 'day' | 'month' = 'month'
): Promise<PeriodPoint[]> {
  const dateFormat = granularity === 'day' ? '%Y-%m-%d' : '%Y-%m';
  const sales = await col<Sale>(COLLECTIONS.sales);
  const revenueByPeriod = await sales
    .aggregate<{ _id: string; total: number }>([
      { $match: { businessId, status: { $in: REVENUE_SALE_STATUSES }, ...rangeFilter('date', range) } },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: { $toDate: '$date' } } },
          total: { $sum: '$grandTotal' },
        },
      },
    ])
    .toArray();

  const expenses = await col<Expense>(COLLECTIONS.expenses);
  const expensesByPeriod = await expenses
    .aggregate<{ _id: string; total: number }>([
      { $match: { businessId, ...rangeFilter('date', range) } },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: { $toDate: '$date' } } },
          total: { $sum: '$amount' },
        },
      },
    ])
    .toArray();

  const periods = new Map<string, { revenue: number; expenses: number }>();
  for (const r of revenueByPeriod) periods.set(r._id, { revenue: r.total, expenses: periods.get(r._id)?.expenses ?? 0 });
  for (const e of expensesByPeriod) {
    periods.set(e._id, { revenue: periods.get(e._id)?.revenue ?? 0, expenses: e.total });
  }

  return [...periods.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, v]) => ({ period, revenue: v.revenue, expenses: v.expenses, profit: v.revenue - v.expenses }));
}

// ---------------------------------------------------------------------------
// Margins
// ---------------------------------------------------------------------------

export interface MarginRow {
  key: string;
  label: string;
  revenue: number;
  cogs: number;
  margin: number;
  marginPercent: number;
}

export async function getMarginByProduct(businessId: string, range: DateRange): Promise<MarginRow[]> {
  const sales = await col<Sale>(COLLECTIONS.sales);
  const rows = await sales
    .aggregate<{ _id: string; name: string; revenue: number; cogs: number }>([
      { $match: { businessId, status: { $in: REVENUE_SALE_STATUSES }, ...rangeFilter('date', range) } },
      { $unwind: '$lineItems' },
      {
        $group: {
          _id: '$lineItems.productId',
          name: { $first: '$lineItems.name' },
          revenue: { $sum: '$lineItems.lineTotal' },
          cogs: { $sum: { $multiply: ['$lineItems.qty', '$lineItems.unitCost'] } },
        },
      },
      { $sort: { revenue: -1 } },
    ])
    .toArray();

  return rows.map((r) => toMarginRow(r._id, r.name, r.revenue, r.cogs));
}

export async function getMarginByCategory(businessId: string, range: DateRange): Promise<MarginRow[]> {
  const sales = await col<Sale>(COLLECTIONS.sales);
  const rows = await sales
    .aggregate<{ _id: string; revenue: number; cogs: number }>([
      { $match: { businessId, status: { $in: REVENUE_SALE_STATUSES }, ...rangeFilter('date', range) } },
      { $unwind: '$lineItems' },
      {
        $lookup: {
          from: COLLECTIONS.products,
          localField: 'lineItems.productId',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ['$product.category', 'Uncategorized'] },
          revenue: { $sum: '$lineItems.lineTotal' },
          cogs: { $sum: { $multiply: ['$lineItems.qty', '$lineItems.unitCost'] } },
        },
      },
      { $sort: { revenue: -1 } },
    ])
    .toArray();

  return rows.map((r) => toMarginRow(r._id, r._id, r.revenue, r.cogs));
}

function toMarginRow(key: string, label: string, revenue: number, cogs: number): MarginRow {
  const margin = revenue - cogs;
  return { key, label, revenue, cogs, margin, marginPercent: revenue > 0 ? round1((margin / revenue) * 100) : 0 };
}

// ---------------------------------------------------------------------------
// Aging — accounts receivable / payable
// ---------------------------------------------------------------------------

export interface AgingBucket {
  current: number;
  d1to30: number;
  d31to60: number;
  d60plus: number;
  total: number;
}

export interface AgingRow {
  id: string;
  name: string;
  amountDue: number;
  daysOverdue: number;
  bucket: 'current' | 'd1to30' | 'd31to60' | 'd60plus';
}

function bucketFor(daysOverdue: number): AgingRow['bucket'] {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return 'd1to30';
  if (daysOverdue <= 60) return 'd31to60';
  return 'd60plus';
}

export async function getReceivablesAging(businessId: string): Promise<{ summary: AgingBucket; rows: AgingRow[] }> {
  const invoices = await col<Invoice>(COLLECTIONS.invoices);
  const openInvoices = await invoices
    .find({ businessId, amountDue: { $gt: 0 }, status: { $ne: 'void' } })
    .toArray();

  const customers = await col<{ _id: string; name: string }>(COLLECTIONS.customers);
  const custIds = [...new Set(openInvoices.map((i) => i.customerId))];
  const custDocs = await customers.find({ _id: { $in: custIds } }).toArray();
  const custMap = new Map(custDocs.map((c) => [c._id, c.name]));

  const summary: AgingBucket = { current: 0, d1to30: 0, d31to60: 0, d60plus: 0, total: 0 };
  const rows: AgingRow[] = openInvoices.map((inv) => {
    const daysOverdue = Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86400000);
    const bucket = bucketFor(daysOverdue);
    summary[bucket] += inv.amountDue;
    summary.total += inv.amountDue;
    return {
      id: inv._id,
      name: custMap.get(inv.customerId) ?? 'Unknown customer',
      amountDue: inv.amountDue,
      daysOverdue: Math.max(0, daysOverdue),
      bucket,
    };
  });

  return { summary, rows: rows.sort((a, b) => b.amountDue - a.amountDue) };
}

export async function getPayablesAging(businessId: string): Promise<{ summary: AgingBucket; rows: AgingRow[] }> {
  const pos = await col<PurchaseOrder>(COLLECTIONS.purchaseOrders);
  const openPOs = await pos
    .find({ businessId, status: { $ne: 'cancelled' } })
    .toArray();

  const suppliers = await col<Supplier>(COLLECTIONS.suppliers);
  const supIds = [...new Set(openPOs.map((p) => p.supplierId))];
  const supDocs = await suppliers.find({ _id: { $in: supIds } }).toArray();
  const supMap = new Map(supDocs.map((s) => [s._id, { name: s.name, terms: s.paymentTermsDays }]));

  const summary: AgingBucket = { current: 0, d1to30: 0, d31to60: 0, d60plus: 0, total: 0 };
  const rows: AgingRow[] = [];
  for (const po of openPOs) {
    const amountDue = po.total - po.amountPaid;
    if (amountDue <= 0) continue;
    const supplier = supMap.get(po.supplierId);
    const baseDate = po.receivedDate || po.expectedDate || po.createdAt;
    const dueDate = new Date(baseDate).getTime() + (supplier?.terms ?? 30) * 86400000;
    const daysOverdue = Math.floor((Date.now() - dueDate) / 86400000);
    const bucket = bucketFor(daysOverdue);
    summary[bucket] += amountDue;
    summary.total += amountDue;
    rows.push({
      id: po._id,
      name: supplier?.name ?? 'Unknown supplier',
      amountDue,
      daysOverdue: Math.max(0, daysOverdue),
      bucket,
    });
  }

  return { summary, rows: rows.sort((a, b) => b.amountDue - a.amountDue) };
}

// ---------------------------------------------------------------------------
// Cash flow — actual and projected
// ---------------------------------------------------------------------------

export interface CashFlowPeriod {
  period: string;
  cashIn: number;
  cashOut: number;
  net: number;
}

export async function getCashFlow(
  businessId: string,
  range: DateRange,
  granularity: 'day' | 'month' = 'month'
): Promise<CashFlowPeriod[]> {
  const dateFormat = granularity === 'day' ? '%Y-%m-%d' : '%Y-%m';
  const payments = await col<Payment>(COLLECTIONS.payments);
  const paymentAgg = await payments
    .aggregate<{ _id: string; direction: 'in' | 'out'; total: number }>([
      { $match: { businessId, ...rangeFilter('date', range) } },
      {
        $group: {
          _id: { period: { $dateToString: { format: dateFormat, date: { $toDate: '$date' } } }, direction: '$direction' },
          total: { $sum: '$amount' },
        },
      },
      { $project: { _id: '$_id.period', direction: '$_id.direction', total: 1 } },
    ])
    .toArray();

  const expenses = await col<Expense>(COLLECTIONS.expenses);
  const expenseAgg = await expenses
    .aggregate<{ _id: string; total: number }>([
      { $match: { businessId, ...rangeFilter('date', range) } },
      { $group: { _id: { $dateToString: { format: dateFormat, date: { $toDate: '$date' } } }, total: { $sum: '$amount' } } },
    ])
    .toArray();

  const periods = new Map<string, CashFlowPeriod>();
  const get = (p: string) => {
    if (!periods.has(p)) periods.set(p, { period: p, cashIn: 0, cashOut: 0, net: 0 });
    return periods.get(p) as CashFlowPeriod;
  };
  for (const p of paymentAgg) {
    const bucket = get(p._id);
    if (p.direction === 'in') bucket.cashIn += p.total;
    else bucket.cashOut += p.total;
  }
  for (const e of expenseAgg) {
    get(e._id).cashOut += e.total;
  }
  for (const bucket of periods.values()) bucket.net = bucket.cashIn - bucket.cashOut;

  return [...periods.values()].sort((a, b) => a.period.localeCompare(b.period));
}

export async function getCurrentCashPosition(businessId: string): Promise<number> {
  const payments = await col<Payment>(COLLECTIONS.payments);
  const [agg] = await payments
    .aggregate<{ inTotal: number; outTotal: number }>([
      { $match: { businessId } },
      {
        $group: {
          _id: null,
          inTotal: { $sum: { $cond: [{ $eq: ['$direction', 'in'] }, '$amount', 0] } },
          outTotal: { $sum: { $cond: [{ $eq: ['$direction', 'out'] }, '$amount', 0] } },
        },
      },
    ])
    .toArray();

  const expenses = await col<Expense>(COLLECTIONS.expenses);
  const [expAgg] = await expenses.aggregate<{ total: number }>([{ $match: { businessId } }, { $group: { _id: null, total: { $sum: '$amount' } } }]).toArray();

  return (agg?.inTotal ?? 0) - (agg?.outTotal ?? 0) - (expAgg?.total ?? 0);
}

export interface CashFlowProjection {
  currentCash: number;
  expectedInflows: number; // face value of open invoices
  weightedExpectedInflows: number; // discounted by customer payment history / overdue age
  scheduledOutflows: number; // open PO balances + recurring expenses due in the horizon
  projectedCash: number;
  averageMonthlyBurn: number;
  runwayMonths: number | null; // null when there is no burn (cannot run out)
  horizonDays: number;
}

/** Likelihood an open invoice actually gets collected, based on how overdue it already is. */
function collectionLikelihood(daysOverdue: number): number {
  if (daysOverdue <= 0) return 0.95;
  if (daysOverdue <= 30) return 0.8;
  if (daysOverdue <= 60) return 0.5;
  return 0.25;
}

export async function getCashFlowProjection(businessId: string, horizonDays = 90): Promise<CashFlowProjection> {
  const currentCash = await getCurrentCashPosition(businessId);

  const invoices = await col<Invoice>(COLLECTIONS.invoices);
  const openInvoices = await invoices.find({ businessId, amountDue: { $gt: 0 }, status: { $ne: 'void' } }).toArray();
  let expectedInflows = 0;
  let weightedExpectedInflows = 0;
  for (const inv of openInvoices) {
    const daysOverdue = Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86400000);
    expectedInflows += inv.amountDue;
    weightedExpectedInflows += inv.amountDue * collectionLikelihood(daysOverdue);
  }

  const pos = await col<PurchaseOrder>(COLLECTIONS.purchaseOrders);
  const openPOs = await pos.find({ businessId, status: { $nin: ['cancelled'] } }).toArray();
  const poOutflow = openPOs.reduce((sum, po) => sum + Math.max(0, po.total - po.amountPaid), 0);

  const expenses = await col<Expense>(COLLECTIONS.expenses);
  const recurring = await expenses.find({ businessId, recurring: true }).toArray();
  const horizonEnd = Date.now() + horizonDays * 86400000;
  let recurringOutflow = 0;
  for (const exp of recurring) {
    let next = exp.nextOccurrenceDate ? new Date(exp.nextOccurrenceDate).getTime() : new Date(exp.date).getTime();
    const stepDays = frequencyDays(exp.recurrenceFrequency);
    while (next <= horizonEnd) {
      if (next >= Date.now()) recurringOutflow += exp.amount;
      next += stepDays * 86400000;
    }
  }

  const scheduledOutflows = poOutflow + recurringOutflow;
  const projectedCash = currentCash + weightedExpectedInflows - scheduledOutflows;

  // Trailing-3-month average burn from actual cash flow, used for the runway estimate.
  const threeMonthsAgo = new Date(Date.now() - 90 * 86400000).toISOString();
  const trailing = await getCashFlow(businessId, { from: threeMonthsAgo, to: new Date().toISOString() }, 'month');
  const totalOut = trailing.reduce((s, p) => s + p.cashOut, 0);
  const totalIn = trailing.reduce((s, p) => s + p.cashIn, 0);
  const monthsCovered = Math.max(1, trailing.length);
  const averageMonthlyBurn = Math.max(0, (totalOut - totalIn) / monthsCovered);

  return {
    currentCash,
    expectedInflows,
    weightedExpectedInflows: Math.round(weightedExpectedInflows),
    scheduledOutflows,
    projectedCash: Math.round(projectedCash),
    averageMonthlyBurn: Math.round(averageMonthlyBurn),
    runwayMonths: averageMonthlyBurn > 0 ? round1(currentCash / averageMonthlyBurn) : null,
    horizonDays,
  };
}

function frequencyDays(freq?: 'weekly' | 'monthly' | 'quarterly' | 'yearly'): number {
  switch (freq) {
    case 'weekly':
      return 7;
    case 'quarterly':
      return 91;
    case 'yearly':
      return 365;
    case 'monthly':
    default:
      return 30;
  }
}

// ---------------------------------------------------------------------------
// Top products / customers, expense breakdown
// ---------------------------------------------------------------------------

export async function getTopProducts(businessId: string, range: DateRange, limit = 10) {
  const sales = await col<Sale>(COLLECTIONS.sales);
  return sales
    .aggregate([
      { $match: { businessId, status: { $in: REVENUE_SALE_STATUSES }, ...rangeFilter('date', range) } },
      { $unwind: '$lineItems' },
      {
        $group: {
          _id: '$lineItems.productId',
          name: { $first: '$lineItems.name' },
          unitsSold: { $sum: '$lineItems.qty' },
          revenue: { $sum: '$lineItems.lineTotal' },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: limit },
    ])
    .toArray();
}

export async function getTopCustomers(businessId: string, range: DateRange, limit = 10) {
  const sales = await col<Sale>(COLLECTIONS.sales);
  const rows = await sales
    .aggregate<{ _id: string; revenue: number; orders: number }>([
      {
        $match: {
          businessId,
          status: { $in: REVENUE_SALE_STATUSES },
          customerId: { $exists: true },
          ...rangeFilter('date', range),
        },
      },
      { $group: { _id: '$customerId', revenue: { $sum: '$grandTotal' }, orders: { $sum: 1 } } },
      { $sort: { revenue: -1 } },
      { $limit: limit },
    ])
    .toArray();

  const customers = await col<{ _id: string; name: string }>(COLLECTIONS.customers);
  const docs = await customers.find({ _id: { $in: rows.map((r) => r._id) } }).toArray();
  const nameMap = new Map(docs.map((d) => [d._id, d.name]));
  return rows.map((r) => ({ customerId: r._id, name: nameMap.get(r._id) ?? 'Unknown', revenue: r.revenue, orders: r.orders }));
}

export async function getExpenseBreakdown(businessId: string, range: DateRange) {
  const expenses = await col<Expense>(COLLECTIONS.expenses);
  return expenses
    .aggregate([
      { $match: { businessId, ...rangeFilter('date', range) } },
      { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ])
    .toArray();
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
