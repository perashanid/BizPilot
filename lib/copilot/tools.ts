/**
 * Read-only, businessId-scoped data functions the copilot (LLM tool-calling and the
 * keyword fallback) can call. Every function returns a small, JSON-serializable summary —
 * this feeds an LLM context window, so keep payloads compact and round numbers where sensible.
 *
 * businessId is NEVER accepted from the model — dispatchTool always injects it server-side
 * from the session. The model only ever supplies the other (validated, defaulted) arguments.
 */
import { col, COLLECTIONS } from '../db';
import {
  getProfitLoss as flGetProfitLoss,
  getCashFlowProjection,
  getTopProducts as flGetTopProducts,
  getExpenseBreakdown as flGetExpenseBreakdown,
  type DateRange,
  type CashFlowProjection,
  type ProfitLoss,
} from '../financials';
import { listInventory } from '../inventory';
import type { Customer, Invoice, Product, Sale } from '../types';

const DAY_MS = 86400000;

function dateRangeForDays(days: number): DateRange {
  const to = Date.now();
  const from = to - days * DAY_MS;
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clampDays(value: unknown, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.min(365, Math.max(1, n));
}

function clampLimit(value: unknown, fallback: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.min(max, Math.max(1, n));
}

// ---------------------------------------------------------------------------
// getSalesSummary
// ---------------------------------------------------------------------------

export interface SalesSummary {
  days: number;
  revenue: number;
  orderCount: number;
  avgOrderValue: number;
}

export async function getSalesSummary(businessId: string, days = 30): Promise<SalesSummary> {
  const safeDays = clampDays(days, 30);
  const range = dateRangeForDays(safeDays);
  const pl = await flGetProfitLoss(businessId, range);

  const sales = await col<Sale>(COLLECTIONS.sales);
  const orderCount = await sales.countDocuments({
    businessId,
    status: { $in: ['confirmed', 'fulfilled'] },
    date: { $gte: range.from, $lte: range.to },
  });

  return {
    days: safeDays,
    revenue: pl.revenue,
    orderCount,
    avgOrderValue: orderCount > 0 ? Math.round(pl.revenue / orderCount) : 0,
  };
}

// ---------------------------------------------------------------------------
// getInventoryStatus
// ---------------------------------------------------------------------------

export interface LowStockProduct {
  name: string;
  sku: string;
  available: number;
  reorderPoint: number;
}

export interface InventoryStatus {
  count: number;
  products: LowStockProduct[];
}

export async function getInventoryStatus(businessId: string): Promise<InventoryStatus> {
  const productsCol = await col<Product>(COLLECTIONS.products);
  const [inventoryRecords, products] = await Promise.all([
    listInventory(businessId),
    productsCol.find({ businessId, trackInventory: true, status: 'active' }).toArray(),
  ]);
  const productMap = new Map(products.map((p) => [p._id, p]));

  const availableByProduct = new Map<string, number>();
  for (const rec of inventoryRecords) {
    if (!productMap.has(rec.productId)) continue;
    availableByProduct.set(rec.productId, (availableByProduct.get(rec.productId) ?? 0) + rec.available);
  }

  const low: LowStockProduct[] = [];
  for (const [productId, available] of availableByProduct.entries()) {
    const product = productMap.get(productId);
    if (!product) continue;
    if (available <= product.reorderPoint) {
      low.push({ name: product.name, sku: product.sku, available, reorderPoint: product.reorderPoint });
    }
  }
  low.sort((a, b) => a.available - b.available);

  return { count: low.length, products: low.slice(0, 15) };
}

// ---------------------------------------------------------------------------
// getCashPosition
// ---------------------------------------------------------------------------

export async function getCashPosition(businessId: string): Promise<CashFlowProjection> {
  return getCashFlowProjection(businessId);
}

// ---------------------------------------------------------------------------
// getOverdueInvoices
// ---------------------------------------------------------------------------

export interface OverdueInvoiceSummary {
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  amountDue: number;
  daysOverdue: number;
}

export async function getOverdueInvoices(businessId: string, limit = 10): Promise<OverdueInvoiceSummary[]> {
  const safeLimit = clampLimit(limit, 10, 50);
  const invoices = await col<Invoice>(COLLECTIONS.invoices);
  const now = new Date().toISOString();
  const overdue = await invoices
    .find({ businessId, amountDue: { $gt: 0 }, status: { $ne: 'void' }, dueDate: { $lt: now } })
    .sort({ amountDue: -1 })
    .limit(safeLimit)
    .toArray();

  if (overdue.length === 0) return [];

  const customers = await col<Customer>(COLLECTIONS.customers);
  const custDocs = await customers.find({ _id: { $in: [...new Set(overdue.map((i) => i.customerId))] } }).toArray();
  const nameMap = new Map(custDocs.map((c) => [c._id, c.name]));
  const nowMs = Date.now();

  return overdue.map((inv) => ({
    invoiceId: inv._id,
    invoiceNumber: inv.invoiceNumber,
    customerName: nameMap.get(inv.customerId) ?? 'Unknown customer',
    amountDue: inv.amountDue,
    daysOverdue: Math.max(0, Math.floor((nowMs - new Date(inv.dueDate).getTime()) / DAY_MS)),
  }));
}

// ---------------------------------------------------------------------------
// getTopProducts
// ---------------------------------------------------------------------------

export interface TopProductSummary {
  productId: string;
  name: string;
  unitsSold: number;
  revenue: number;
}

export async function getTopProducts(businessId: string, days = 30, limit = 10): Promise<TopProductSummary[]> {
  const safeDays = clampDays(days, 30);
  const safeLimit = clampLimit(limit, 10, 50);
  const range = dateRangeForDays(safeDays);
  const rows = (await flGetTopProducts(businessId, range, safeLimit)) as Array<{
    _id: string;
    name: string;
    unitsSold: number;
    revenue: number;
  }>;
  return rows.map((r) => ({ productId: r._id, name: r.name, unitsSold: r.unitsSold, revenue: r.revenue }));
}

// ---------------------------------------------------------------------------
// getExpenseBreakdown
// ---------------------------------------------------------------------------

export interface ExpenseCategorySummary {
  category: string;
  total: number;
  count: number;
}

export async function getExpenseBreakdown(businessId: string, days = 90): Promise<ExpenseCategorySummary[]> {
  const safeDays = clampDays(days, 90);
  const range = dateRangeForDays(safeDays);
  const rows = (await flGetExpenseBreakdown(businessId, range)) as Array<{ _id: string; total: number; count: number }>;
  return rows.map((r) => ({ category: r._id, total: r.total, count: r.count }));
}

// ---------------------------------------------------------------------------
// getCustomerHistory
// ---------------------------------------------------------------------------

export interface CustomerHistoryOrder {
  orderNumber: string;
  date: string;
  grandTotal: number;
  status: string;
}

export type CustomerHistoryResult =
  | { found: false }
  | {
      found: true;
      customerId: string;
      name: string;
      totalSpend: number;
      outstandingBalance: number;
      lastOrderDate: string | null;
      recentOrders: CustomerHistoryOrder[];
    };

export async function getCustomerHistory(businessId: string, customerName: string): Promise<CustomerHistoryResult> {
  const trimmed = (customerName ?? '').trim();
  if (!trimmed) return { found: false };

  const customers = await col<Customer>(COLLECTIONS.customers);
  const customer = await customers.findOne({ businessId, name: { $regex: escapeRegex(trimmed), $options: 'i' } });
  if (!customer) return { found: false };

  const sales = await col<Sale>(COLLECTIONS.sales);
  const [spendAgg] = await sales
    .aggregate<{ total: number }>([
      { $match: { businessId, customerId: customer._id, status: { $in: ['confirmed', 'fulfilled'] } } },
      { $group: { _id: null, total: { $sum: '$grandTotal' } } },
    ])
    .toArray();

  const recentDocs = await sales
    .find({ businessId, customerId: customer._id })
    .sort({ date: -1 })
    .limit(5)
    .toArray();

  const invoices = await col<Invoice>(COLLECTIONS.invoices);
  const [dueAgg] = await invoices
    .aggregate<{ total: number }>([
      { $match: { businessId, customerId: customer._id, status: { $ne: 'void' } } },
      { $group: { _id: null, total: { $sum: '$amountDue' } } },
    ])
    .toArray();

  return {
    found: true,
    customerId: customer._id,
    name: customer.name,
    totalSpend: spendAgg?.total ?? 0,
    outstandingBalance: dueAgg?.total ?? 0,
    lastOrderDate: recentDocs[0]?.date ?? null,
    recentOrders: recentDocs.map((s) => ({
      orderNumber: s.orderNumber,
      date: s.date,
      grandTotal: s.grandTotal,
      status: s.status,
    })),
  };
}

// ---------------------------------------------------------------------------
// getProfitLoss
// ---------------------------------------------------------------------------

export interface ProfitLossComparison {
  days: number;
  current: ProfitLoss;
  prior: ProfitLoss;
}

export async function getProfitLoss(businessId: string, days = 30): Promise<ProfitLossComparison> {
  const safeDays = clampDays(days, 30);
  const now = Date.now();
  const currentRange: DateRange = {
    from: new Date(now - safeDays * DAY_MS).toISOString(),
    to: new Date(now).toISOString(),
  };
  const priorRange: DateRange = {
    from: new Date(now - safeDays * 2 * DAY_MS).toISOString(),
    to: new Date(now - safeDays * DAY_MS).toISOString(),
  };
  const [current, prior] = await Promise.all([
    flGetProfitLoss(businessId, currentRange),
    flGetProfitLoss(businessId, priorRange),
  ]);
  return { days: safeDays, current, prior };
}

// ---------------------------------------------------------------------------
// Provider-agnostic tool schema + dispatch (JSON-Schema-shaped; llm.ts converts
// this to whatever shape the configured model provider expects).
// ---------------------------------------------------------------------------

export interface CopilotToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, { type: string; description?: string }>;
    required: string[];
  };
}

export const TOOL_DEFINITIONS: CopilotToolDefinition[] = [
  {
    name: 'getSalesSummary',
    description:
      'Get total revenue, order count, and average order value for this business over a trailing number of days.',
    input_schema: {
      type: 'object',
      properties: { days: { type: 'number', description: 'Number of trailing days to include (default 30).' } },
      required: [],
    },
  },
  {
    name: 'getInventoryStatus',
    description:
      'Get the count and a list of products that are at or below their reorder point (low or out of stock).',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'getCashPosition',
    description:
      'Get the current cash position and a cash flow projection: expected inflows/outflows, burn rate, and runway.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'getOverdueInvoices',
    description: 'Get invoices that are overdue (past due date with a balance owing), sorted by amount due, descending.',
    input_schema: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Max number of invoices to return (default 10).' } },
      required: [],
    },
  },
  {
    name: 'getTopProducts',
    description: 'Get the best-selling products by revenue over a trailing number of days.',
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Number of trailing days to include (default 30).' },
        limit: { type: 'number', description: 'Max number of products to return (default 10).' },
      },
      required: [],
    },
  },
  {
    name: 'getExpenseBreakdown',
    description: 'Get expense totals grouped by category over a trailing number of days.',
    input_schema: {
      type: 'object',
      properties: { days: { type: 'number', description: 'Number of trailing days to include (default 90).' } },
      required: [],
    },
  },
  {
    name: 'getCustomerHistory',
    description:
      'Look up a customer by name (fuzzy, case-insensitive match) and get their total spend, outstanding balance, last order date, and recent orders.',
    input_schema: {
      type: 'object',
      properties: { customerName: { type: 'string', description: 'The customer name to search for.' } },
      required: ['customerName'],
    },
  },
  {
    name: 'getProfitLoss',
    description:
      'Get profit & loss (revenue, COGS, gross profit, expenses, net profit) for a trailing number of days, plus the prior period of equal length for comparison.',
    input_schema: {
      type: 'object',
      properties: { days: { type: 'number', description: 'Number of trailing days to include (default 30).' } },
      required: [],
    },
  },
];

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Dispatches a named tool call to the matching function above. businessId is always server-injected. */
export async function dispatchTool(name: string, input: Record<string, unknown>, businessId: string): Promise<unknown> {
  switch (name) {
    case 'getSalesSummary':
      return getSalesSummary(businessId, asNumber(input.days, 30));
    case 'getInventoryStatus':
      return getInventoryStatus(businessId);
    case 'getCashPosition':
      return getCashPosition(businessId);
    case 'getOverdueInvoices':
      return getOverdueInvoices(businessId, asNumber(input.limit, 10));
    case 'getTopProducts':
      return getTopProducts(businessId, asNumber(input.days, 30), asNumber(input.limit, 10));
    case 'getExpenseBreakdown':
      return getExpenseBreakdown(businessId, asNumber(input.days, 90));
    case 'getCustomerHistory':
      return getCustomerHistory(businessId, typeof input.customerName === 'string' ? input.customerName : '');
    case 'getProfitLoss':
      return getProfitLoss(businessId, asNumber(input.days, 30));
    default:
      throw new Error(`Unknown copilot tool: ${name}`);
  }
}
