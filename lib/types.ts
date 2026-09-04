/**
 * Single source of truth for every data shape in the app.
 * API routes, lib/ business logic, and the frontend all import from here.
 * Money fields are always integers in the smallest currency unit (e.g. cents).
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export type ID = string;
/** Integer amount in the smallest currency unit. Never a float. */
export type Money = number;

export const zId = z.string().min(1);
export const zMoney = z.number().int();
export const zNonNegMoney = z.number().int().min(0);
export const zDateStr = z.string().min(1); // ISO date string

export interface WithMeta {
  _id: ID;
  businessId: ID;
  createdAt: string;
  updatedAt: string;
}

export const ROLES = ['owner', 'manager', 'staff', 'accountant'] as const;
export type Role = (typeof ROLES)[number];

export const PAGINATION_DEFAULTS = { page: 1, limit: 20, maxLimit: 100 } as const;

export const zPagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION_DEFAULTS.maxLimit).default(PAGINATION_DEFAULTS.limit),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().optional(),
});
export type PaginationQuery = z.infer<typeof zPagination>;

export interface Paginated<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface ApiError {
  error: { code: string; message: string; fields?: Record<string, string> };
}

// ---------------------------------------------------------------------------
// Business
// ---------------------------------------------------------------------------

export const MODULES = [
  'sales',
  'inventory',
  'purchases',
  'expenses',
  'invoices',
  'employees',
  'tasks',
  'copilot',
] as const;
export type ModuleKey = (typeof MODULES)[number];

export const zTaxRate = z.object({
  name: z.string().min(1).max(60),
  rate: z.number().min(0).max(100), // percent
  isDefault: z.boolean().default(false),
});
export type TaxRateSetting = z.infer<typeof zTaxRate>;

export const zBusinessCreate = z.object({
  name: z.string().trim().min(1, 'Business name is required').max(200),
  legalName: z.string().trim().max(200).optional(),
  industry: z.string().trim().max(100).optional(),
  currency: z.string().trim().length(3).default('USD'),
  timezone: z.string().trim().min(1).default('UTC'),
  fiscalYearStartMonth: z.number().int().min(1).max(12).default(1),
  address: z.string().trim().max(500).optional(),
});
export type BusinessCreateInput = z.infer<typeof zBusinessCreate>;

export interface Business extends WithMeta {
  name: string;
  legalName?: string;
  industry?: string;
  currency: string; // ISO 4217, e.g. "USD"
  timezone: string;
  fiscalYearStartMonth: number; // 1-12
  taxSettings: { rates: TaxRateSetting[]; pricesIncludeTax: boolean };
  invoiceSettings: { prefix: string; nextNumber: number; terms?: string; footer?: string };
  poSettings: { prefix: string; nextNumber: number };
  orderSettings: { prefix: string; nextNumber: number };
  address?: string;
  logoUrl?: string;
  enabledModules: ModuleKey[];
  allowBackorders: boolean;
  onboardingComplete: boolean;
  isDemo?: boolean;
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const zRegisterInput = z.object({
  businessName: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
});
export type RegisterInput = z.infer<typeof zRegisterInput>;

export const zLoginInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof zLoginInput>;

export interface User extends WithMeta {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  status: 'active' | 'invited' | 'disabled';
  permissions?: string[];
  lastLoginAt?: string;
}

export type PublicUser = Omit<User, 'passwordHash'>;

export interface SessionUser {
  userId: ID;
  businessId: ID;
  role: Role;
  name: string;
  email: string;
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export const zCustomerInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  businessName: z.string().trim().max(200).optional(),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal('')),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(500).optional(),
  taxId: z.string().trim().max(60).optional(),
  paymentTermsDays: z.number().int().min(0).max(365).default(0),
  creditLimit: zNonNegMoney.default(0),
  tags: z.array(z.string().trim().max(40)).default([]),
  notes: z.string().trim().max(2000).optional(),
  status: z.enum(['active', 'inactive']).default('active'),
});
export type CustomerInput = z.infer<typeof zCustomerInput>;

export interface Customer extends WithMeta, CustomerInput {}

export interface CustomerWithStats extends Customer {
  totalSpend: Money;
  outstandingBalance: Money;
  lastOrderDate: string | null;
}

// ---------------------------------------------------------------------------
// Products & inventory
// ---------------------------------------------------------------------------

export const zVariant = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  sku: z.string().trim().min(1).max(60),
  price: zNonNegMoney,
  stock: z.number().int().default(0),
});
export type Variant = z.infer<typeof zVariant>;

export const zProductInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  sku: z.string().trim().min(1, 'SKU is required').max(60),
  barcode: z.string().trim().max(60).optional(),
  category: z.string().trim().max(100).optional(),
  unit: z.string().trim().max(30).default('unit'),
  costPrice: zNonNegMoney,
  salePrice: zNonNegMoney,
  taxRate: z.number().min(0).max(100).default(0),
  reorderPoint: z.number().int().min(0).default(0),
  trackInventory: z.boolean().default(true),
  status: z.enum(['active', 'archived']).default('active'),
  variants: z.array(zVariant).default([]),
});
export type ProductInput = z.infer<typeof zProductInput>;

export interface Product extends WithMeta, ProductInput {}

export interface ProductWithStock extends Product {
  available: number;
  margin: number; // percent
}

export const zInventoryAdjustInput = z.object({
  productId: zId,
  variantId: z.string().optional(),
  location: z.string().trim().min(1).default('default'),
  delta: z.number().int().refine((v) => v !== 0, 'Adjustment cannot be zero'),
  reason: z.string().trim().min(1, 'Reason is required').max(500),
});
export type InventoryAdjustInput = z.infer<typeof zInventoryAdjustInput>;

export interface InventoryRecord extends WithMeta {
  productId: ID;
  variantId?: string;
  location: string;
  quantityOnHand: number;
  quantityReserved: number;
}

export interface InventoryWithAvailable extends InventoryRecord {
  available: number;
}

export const STOCK_MOVEMENT_TYPES = ['sale', 'purchase', 'adjustment', 'return', 'transfer'] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export interface StockMovement extends WithMeta {
  productId: ID;
  variantId?: string;
  location: string;
  type: StockMovementType;
  quantityDelta: number;
  quantityAfter: number;
  unitCost: Money;
  reason?: string;
  referenceType?: string;
  referenceId?: ID;
  userId: ID;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Suppliers & purchase orders
// ---------------------------------------------------------------------------

export const zSupplierInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  contactPerson: z.string().trim().max(120).optional(),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal('')),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(500).optional(),
  paymentTermsDays: z.number().int().min(0).max(365).default(30),
  leadTimeDays: z.number().int().min(0).max(365).default(7),
  productIds: z.array(zId).default([]),
  notes: z.string().trim().max(2000).optional(),
  status: z.enum(['active', 'inactive']).default('active'),
});
export type SupplierInput = z.infer<typeof zSupplierInput>;

export interface Supplier extends WithMeta, SupplierInput {}

export interface SupplierWithStats extends Supplier {
  outstandingPayable: Money;
  onTimeDeliveryRate: number | null; // percent, null if no delivered POs yet
}

export const zPoLineItem = z.object({
  productId: zId,
  variantId: z.string().optional(),
  name: z.string().trim().min(1),
  sku: z.string().trim().optional(),
  qtyOrdered: z.number().int().min(1),
  qtyReceived: z.number().int().min(0).default(0),
  unitCost: zNonNegMoney,
});
export type PoLineItem = z.infer<typeof zPoLineItem>;

export const PO_STATUSES = ['draft', 'sent', 'partially_received', 'received', 'cancelled'] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export const zPurchaseOrderInput = z.object({
  supplierId: zId,
  lineItems: z.array(zPoLineItem).min(1, 'At least one line item is required'),
  shipping: zNonNegMoney.default(0),
  expectedDate: zDateStr.optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type PurchaseOrderInput = z.infer<typeof zPurchaseOrderInput>;

export interface PurchaseOrder extends WithMeta {
  poNumber: string;
  supplierId: ID;
  lineItems: PoLineItem[];
  subtotal: Money;
  tax: Money;
  shipping: Money;
  total: Money;
  amountPaid: Money;
  expectedDate?: string;
  receivedDate?: string;
  status: PoStatus;
  notes?: string;
}

export const zReceivePoInput = z.object({
  lines: z
    .array(
      z.object({
        productId: zId,
        variantId: z.string().optional(),
        qtyReceived: z.number().int().min(0),
      })
    )
    .min(1),
});
export type ReceivePoInput = z.infer<typeof zReceivePoInput>;

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

export const zSaleLineItem = z.object({
  productId: zId,
  variantId: z.string().optional(),
  name: z.string().trim().min(1),
  qty: z.number().int().min(1),
  unitPrice: zNonNegMoney,
  discount: zNonNegMoney.default(0),
  taxRate: z.number().min(0).max(100).default(0),
});
export type SaleLineItem = z.infer<typeof zSaleLineItem>;

export const SALE_STATUSES = ['draft', 'confirmed', 'fulfilled', 'cancelled', 'refunded'] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];
export const PAYMENT_STATUSES = ['unpaid', 'partial', 'paid'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const zSaleInput = z.object({
  customerId: zId.optional(),
  lineItems: z.array(zSaleLineItem).min(1, 'At least one line item is required'),
  discountTotal: zNonNegMoney.default(0),
  channel: z.string().trim().max(60).default('in_store'),
  date: zDateStr.optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type SaleInput = z.infer<typeof zSaleInput>;

export interface Sale extends WithMeta {
  orderNumber: string;
  customerId?: ID;
  lineItems: (SaleLineItem & { lineTotal: Money; unitCost: Money })[];
  subtotal: Money;
  discountTotal: Money;
  taxTotal: Money;
  grandTotal: Money;
  channel: string;
  status: SaleStatus;
  paymentStatus: PaymentStatus;
  amountPaid: Money;
  date: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Invoices & payments
// ---------------------------------------------------------------------------

export const INVOICE_STATUSES = ['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const zInvoiceLineItem = z.object({
  productId: zId.optional(),
  name: z.string().trim().min(1),
  qty: z.number().int().min(1),
  unitPrice: zNonNegMoney,
  discount: zNonNegMoney.default(0),
  taxRate: z.number().min(0).max(100).default(0),
});
export type InvoiceLineItem = z.infer<typeof zInvoiceLineItem>;

export const zInvoiceInput = z.object({
  customerId: zId,
  saleId: zId.optional(),
  lineItems: z.array(zInvoiceLineItem).min(1, 'At least one line item is required'),
  issueDate: zDateStr,
  dueDate: zDateStr,
  terms: z.string().trim().max(2000).optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type InvoiceInput = z.infer<typeof zInvoiceInput>;

export interface Invoice extends WithMeta {
  invoiceNumber: string;
  customerId: ID;
  saleId?: ID;
  lineItems: (InvoiceLineItem & { lineTotal: Money })[];
  subtotal: Money;
  discountTotal: Money;
  taxTotal: Money;
  total: Money;
  amountPaid: Money;
  amountDue: Money;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  terms?: string;
  notes?: string;
  sentAt?: string;
  reminderHistory: { sentAt: string; method: string }[];
}

export const PAYMENT_METHODS = ['cash', 'bank', 'card', 'mobile', 'cheque', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const zPaymentInput = z.object({
  direction: z.enum(['in', 'out']),
  amount: z.number().int().min(1, 'Amount must be greater than zero'),
  date: zDateStr,
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(120).optional(),
  invoiceId: zId.optional(),
  purchaseOrderId: zId.optional(),
  customerId: zId.optional(),
  supplierId: zId.optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type PaymentInput = z.infer<typeof zPaymentInput>;

export interface Payment extends WithMeta, PaymentInput {}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export const zExpenseInput = z.object({
  amount: z.number().int().min(1, 'Amount must be greater than zero'),
  date: zDateStr,
  category: z.string().trim().min(1, 'Category is required').max(100),
  vendor: z.string().trim().max(200).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).default('cash'),
  receiptUrl: z.string().trim().max(1000).optional(),
  recurring: z.boolean().default(false),
  recurrenceFrequency: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']).optional(),
  taxDeductible: z.boolean().default(false),
  notes: z.string().trim().max(2000).optional(),
});
export type ExpenseInput = z.infer<typeof zExpenseInput>;

export interface Expense extends WithMeta {
  amount: Money;
  date: string;
  category: string;
  vendor?: string;
  paymentMethod: PaymentMethod;
  receiptUrl?: string;
  recurring: boolean;
  recurrenceFrequency?: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  nextOccurrenceDate?: string;
  parentExpenseId?: ID;
  taxDeductible: boolean;
  notes?: string;
  approvalStatus: 'approved' | 'pending' | 'rejected';
  approvedBy?: ID;
}

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

export const zEmployeeInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal('')),
  phone: z.string().trim().max(40).optional(),
  role: z.string().trim().min(1).max(100),
  department: z.string().trim().max(100).optional(),
  employmentType: z.enum(['full_time', 'part_time', 'contract']).default('full_time'),
  salary: zNonNegMoney.default(0),
  payFrequency: z.enum(['weekly', 'biweekly', 'monthly']).default('monthly'),
  startDate: zDateStr,
  status: z.enum(['active', 'on_leave', 'terminated']).default('active'),
  linkedUserId: zId.optional(),
  permissions: z.array(z.string()).default([]),
});
export type EmployeeInput = z.infer<typeof zEmployeeInput>;

export interface Employee extends WithMeta, EmployeeInput {}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export const TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const zSubtask = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(300),
  done: z.boolean().default(false),
});
export type Subtask = z.infer<typeof zSubtask>;

export const zComment = z.object({
  id: z.string().min(1),
  userId: zId,
  text: z.string().trim().min(1).max(2000),
  createdAt: z.string(),
});
export type TaskComment = z.infer<typeof zComment>;

export const zTaskInput = z.object({
  title: z.string().trim().min(1, 'Title is required').max(300),
  description: z.string().trim().max(4000).optional(),
  status: z.enum(TASK_STATUSES).default('todo'),
  priority: z.enum(TASK_PRIORITIES).default('medium'),
  assigneeId: zId.optional(),
  dueDate: zDateStr.optional(),
  subtasks: z.array(zSubtask).default([]),
  linkedEntity: z.object({ type: z.string(), id: zId }).optional(),
});
export type TaskInput = z.infer<typeof zTaskInput>;

export interface Task extends WithMeta, Omit<TaskInput, 'linkedEntity'> {
  linkedEntity?: { type: string; id: ID };
  comments: TaskComment[];
  createdBy: ID;
}

// ---------------------------------------------------------------------------
// Insights (AI)
// ---------------------------------------------------------------------------

export const INSIGHT_SEVERITIES = ['opportunity', 'warning', 'critical'] as const;
export type InsightSeverity = (typeof INSIGHT_SEVERITIES)[number];
export const INSIGHT_STATUSES = ['new', 'accepted', 'dismissed', 'snoozed'] as const;
export type InsightStatus = (typeof INSIGHT_STATUSES)[number];

export interface SuggestedAction {
  type:
    | 'create_purchase_order'
    | 'send_invoice_reminder'
    | 'review_pricing'
    | 'view_report'
    | 'none';
  label: string;
  payload?: Record<string, unknown>;
}

export interface Insight extends WithMeta {
  type: string;
  severity: InsightSeverity;
  title: string;
  body: string;
  data: Record<string, unknown>;
  suggestedAction: SuggestedAction;
  status: InsightStatus;
  generatedAt: string;
  snoozedUntil?: string;
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export interface AuditLogEntry extends WithMeta {
  userId: ID;
  action: string;
  entityType: string;
  entityId: ID;
  before?: unknown;
  after?: unknown;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Copilot chat
// ---------------------------------------------------------------------------

export interface ChatBlock {
  type: 'text' | 'stat' | 'chart' | 'table' | 'action';
  data: unknown;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  blocks?: ChatBlock[];
  createdAt: string;
}

export const zChatInput = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string() }))
    .max(20)
    .default([]),
  pageContext: z.string().optional(),
});
export type ChatInput = z.infer<typeof zChatInput>;

export const zInsightActionInput = z.object({
  decision: z.enum(['execute', 'accept', 'dismiss', 'snooze']),
});
export type InsightActionInput = z.infer<typeof zInsightActionInput>;

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export const REPORT_TYPES = [
  'profit-loss',
  'revenue',
  'expenses',
  'cash-flow',
  'aging-receivable',
  'aging-payable',
  'top-products',
  'top-customers',
  'sales',
  'inventory',
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const zReportQuery = z.object({
  type: z.enum(REPORT_TYPES),
  from: zDateStr,
  to: zDateStr,
  format: z.enum(['json', 'csv', 'pdf']).default('json'),
});
export type ReportQuery = z.infer<typeof zReportQuery>;

export interface GeneratedReport extends WithMeta {
  type: ReportType;
  format: 'json' | 'csv' | 'pdf';
  from: string;
  to: string;
  generatedBy: ID;
  generatedAt: string;
}
