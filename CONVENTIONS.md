# Build conventions — read this before writing any code

This file is the shared contract for everyone contributing code to this repo in this build pass.
Read it fully before writing anything. Do not deviate from it — other parts of the app are being
built in parallel against these exact conventions.

## Stack
Next.js 14 App Router + TypeScript, MongoDB (official `mongodb` driver, no Mongoose), Tailwind +
shadcn/ui-style components, Zod validation, Recharts for charts. Node.js runtime for every route
that touches Mongo (never Edge). `npm run typecheck` (tsc --noEmit) must pass with zero errors when
you're done — check your work against the actual exports in `lib/`, don't guess signatures.

## IDs
**Every `_id` in this app is a string** (a 24-char hex ObjectId string), not a native BSON
ObjectId — including foreign keys like `businessId`, `productId`, `customerId`, etc. Generate new
ids with `newId()` from `lib/id.ts`. Never call `new ObjectId(...)` yourself. Validate an incoming
id with `isValidId()` from the same file.

## Money
All monetary amounts are **integers in the smallest currency unit** (cents). Never floats. Helpers
live in `lib/money.ts`: `formatMoney(minorUnits, currency)` for display, `lineSubtotal`,
`taxForLine`, `marginPercent`, `percentChange`. Format money only in UI components, at the edge —
never in API responses (those stay integers) and never do money math in floats anywhere.

## Multi-tenancy
`businessId` scoping on every single query is mandatory. It always comes from the session
(`requireSession()` in `lib/auth.ts`), **never** from the request body or query string. A route
that trusts a client-supplied businessId is a data leak, full stop.

## Types & validation
Every shape is defined once in `lib/types.ts` — Zod schemas (named `z<Thing>Input` or similar) plus
`z.infer` TS types, and plain `interface`s for stored documents (all extend `WithMeta` which has
`_id, businessId, createdAt, updatedAt`). Import types from there; never redeclare a shape.
Validate every API request body with the matching Zod schema via `parseJson(req, schema)` from
`lib/api-helpers.ts`. Validate query params with `parseQuery(searchParams)` from the same file.

## API route pattern
Every route handler is thin: parse input, validate, call a `lib/` function, return a response.
If a handler exceeds ~15 lines of actual logic (not counting parsing/error plumbing), the logic
belongs in `lib/`, not the route. Standard shape for `app/api/.../route.ts`:

```ts
import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth';
import { parseJson, parseQuery, ok, withErrorHandling } from '@/lib/api-helpers';
import { zSomeInput } from '@/lib/types';
import { someLibFunction } from '@/lib/some-module';

export const runtime = 'nodejs';

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSession();
  const input = await parseJson(req, zSomeInput);
  const result = await someLibFunction(session.businessId, session.userId, input);
  return ok(result, 201);
});
```

`withErrorHandling` catches `AuthError` (401/403), `ApiValidationError` (400 with per-field
messages), `NotFoundError` (404), `BusinessRuleError` (422), and Mongo duplicate-key errors (409),
mapping each to `{ error: { code, message, fields? } }`. Throw those classes from `lib/` functions
(`lib/api-helpers.ts` exports `ApiValidationError`, `NotFoundError`, `BusinessRuleError`); don't
hand-roll error responses in routes. For role checks use `requireRole(session, ['owner','manager'])`
or the `canViewFinancials` / `canEditFinancials` / `canManageInventory` / `canManageUsers` /
`canViewPayroll` helpers in `lib/auth.ts` — return 403 via `AuthError`, never silently empty data.

## Pagination
Every list endpoint accepts `page`, `limit` (default 20, max 100), `sort`, `order`, `search`, plus
entity-specific filters, applied in the Mongo query (never fetch-all-then-filter-in-JS). Use
`listDocs()` from `lib/repo.ts` for simple CRUD collections — it already does search/sort/pagination
scoped to businessId. Response shape is always `{ data, pagination: { page, limit, total,
totalPages } }` — that's the `Paginated<T>` type in `lib/types.ts`.

## Generic CRUD helpers (`lib/repo.ts`)
For entities with no special business logic (customers, products config, suppliers, employees,
tasks), use: `listDocs(collectionName, opts)`, `getDocOr404(collectionName, businessId, id, label)`,
`insertDoc(collectionName, businessId, data)`, `updateDocById(collectionName, businessId, id,
patch, label)`, `deleteDocById(collectionName, businessId, id, label)`. Collection name constants
are in `COLLECTIONS` from `lib/db.ts`.

## Business logic already written — call these, don't reimplement them
- `lib/inventory.ts`: `applyStockMovement`, `adjustStock`, `getAvailableQuantity`,
  `getInventoryRecord`, `listInventory`, `getStockMovementHistory`, `weightedAverageCost`,
  `isBelowReorderPoint`.
- `lib/sales.ts`: `createSale`, `fulfillSale`, `cancelSale`, `refundSale`. Sales are created
  already `confirmed` (stock decrements at creation) — read the file, it documents this decision.
- `lib/invoicing.ts`: `createInvoice`, `convertSaleToInvoice`, `sendInvoice`, `voidInvoice`,
  `deriveInvoiceStatus`/`withDerivedStatus` (status "overdue" is NEVER stored — it's derived at
  read time; always pass invoices through `withDerivedStatus` before returning them from an API).
- `lib/payments.ts`: `recordPayment` (handles both invoice and PO payments, rejects overpayment).
- `lib/purchasing.ts`: `createPurchaseOrder`, `markPurchaseOrderSent`, `cancelPurchaseOrder`,
  `receivePurchaseOrder` (supports partial receipt, updates weighted-average cost).
- `lib/financials.ts`: `getProfitLoss`, `getRevenueVsExpensesByPeriod`, `getMarginByProduct`,
  `getMarginByCategory`, `getReceivablesAging`, `getPayablesAging`, `getCashFlow`,
  `getCurrentCashPosition`, `getCashFlowProjection`, `getTopProducts`, `getTopCustomers`,
  `getExpenseBreakdown`. **All financial reporting must go through these functions** so numbers
  reconcile everywhere (dashboard, reports, copilot all cite the same source of truth).
- `lib/expenses.ts`: `materializeDueRecurringExpenses(businessId)` — call this at the top of any
  route that lists or reads expenses, before querying, so recurring occurrences are generated
  on-read (idempotent, no cron).
- `lib/insights.ts`: `refreshInsights(businessId)` (recomputes + upserts, preserving user
  accept/dismiss decisions), `computeInsightCandidates(businessId)` (pure computation, no writes).
- `lib/business.ts`: `getBusiness`, `getBusinessOr404`, `createBusiness`, `updateBusinessSettings`.
- `lib/audit.ts`: `recordAudit({ businessId, userId, action, entityType, entityId, before, after })`
  — call on every mutating operation (create/update/delete/status-change).
- `lib/auth.ts`: `requireSession`, `requireRole`, `hashPassword`, `verifyPassword`,
  `createSessionCookie`, `clearSessionCookie`, `findUserByEmail`, `findUserById`, `toPublicUser`.

## Error handling & edge cases (non-negotiable)
Every route must survive: empty/whitespace input, huge strings, wrong types, negative/zero/huge
numbers, double-submits, empty result sets, inverted/future date ranges, deleting an entity still
referenced elsewhere (soft-delete via a `status: 'archived'`/`'inactive'` field, or block deletion
with a clear `BusinessRuleError` — never corrupt history), and cross-tenant access attempts (must
404 or 403, never leak another business's data). Never let a route return `undefined`, `NaN`, or
`[object Object]` to the client.

## Frontend conventions
- Use components from `components/ui/*` (shadcn-style primitives) — do not introduce a second
  component library or invent one-off styles.
- Fetch data with plain `fetch()` to the API routes (no React Query unless you find it already
  installed) using client components (`'use client'`) for interactive pages, or server components
  for simple initial data loads — be consistent within a feature area.
- Every async view needs a skeleton loading state, an empty state (with guidance on what to do
  next), and an error state (human message + retry). No bare spinners on blank pages.
- Currency: always `formatMoney(minorUnits, business.currency)`. Dates: pick one `date-fns` format
  and use it everywhere you show a date.
- Fully responsive down to 375px width, no horizontal overflow. Tables become stacked cards on
  narrow screens.
- Debounce search/filter inputs at ~300ms.

## Design language
See `DESIGN.md` at the repo root (design tokens, type scale, component patterns). Calm, dense,
professional financial-product aesthetic — not a generic purple-gradient SaaS template. Use the
CSS variables defined in `app/globals.css` (`--primary`, `--success`, `--warning`, `--destructive`,
etc.) via the Tailwind color tokens (`bg-primary`, `text-success`, ...) — don't hardcode hex colors
in components.

## What NOT to do
- Don't add a second ORM, a second component library, or a second validation library.
- Don't fetch entire collections and filter/paginate in JS.
- Don't open a new MongoDB connection per request — always go through `col()` / `getDb()` from
  `lib/db.ts`, which reuses a module-scoped client.
- Don't put business logic in a route handler — put it in `lib/` and call it.
- Don't invent new API response shapes — reuse `Paginated<T>` and the standard error shape.
