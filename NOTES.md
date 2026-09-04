# Architecture notes

Working notes on how BizPilot is put together, what was assumed where the spec was silent,
what's known-incomplete, and how to click through the major features. Read `CONVENTIONS.md` first
for the coding contract; this file is about *why*, not *how to write a route*.

## Architecture

- **One deployable unit.** Next.js 14 App Router: UI and API routes in the same project, same
  deploy, same TypeScript types end to end (`lib/types.ts`).
- **String ids everywhere.** Every `_id` (and every foreign key) is a 24-char hex string generated
  by `newId()` (`lib/id.ts`), not a native BSON `ObjectId`. This was a deliberate simplification:
  with a single codebase this size, one id representation removes an entire category of
  ObjectId↔string conversion bugs at the cost of a slightly less idiomatic Mongo schema. Ids are
  still sortable by creation time (they're ObjectId hex strings underneath).
- **Money as integer minor units, always.** `lib/money.ts` is the only place that does money math
  or formats currency. No screen, no API route, ever handles money as a float.
- **One `lib/` layer, thin routes.** All business logic (`lib/inventory.ts`, `sales.ts`,
  `invoicing.ts`, `payments.ts`, `purchasing.ts`, `financials.ts`, `insights.ts`, `expenses.ts`)
  is framework-free — plain async functions taking explicit `(businessId, ...)` params, no
  `NextRequest`/`NextResponse` coupling. Every API route is parse → validate → call `lib/` →
  respond. This is also what makes the seed script able to reuse the same money math without
  reimplementing it, and what would make unit tests straightforward to add later (none exist yet
  — see Known limitations).
- **`overdue` is never stored.** An invoice's persisted `status` is one of draft/sent/
  partially_paid/paid/void. "Overdue" is derived at read time from `dueDate` + `amountDue` (see
  `lib/invoicing.ts`'s `deriveInvoiceStatus`/`withDerivedStatus`) — there's no cron job marking
  invoices overdue, so the figure is always correct even if the app hasn't been opened in weeks.
  The same on-read pattern is used for recurring expenses (`lib/expenses.ts`) and for the
  insights engine (`lib/insights.ts`'s `refreshInsights`, called on every visit to the Copilot
  Insights tab and the dashboard).
- **One MongoDB client, module-scoped** (`lib/db.ts`). Required correctness on Vercel serverless,
  not just a performance nicety — a new connection per invocation would exhaust connection limits
  under load.

## Assumptions made where the spec was ambiguous

- **A sale's stock effect happens at creation, not a separate "confirm" step.** The spec says
  "confirming a sale decrements stock." There's no explicit `POST .../confirm` action route in the
  spec's own API list, so `createSale` (`lib/sales.ts`) creates sales already in `confirmed`
  status, decrementing stock immediately. `fulfill` is a separate downstream status change (no
  further stock effect); `cancel`/`refund` both reverse the original decrement. This is documented
  at the top of `lib/sales.ts`.
- **Login email is not globally unique**, per the spec's own data model ("email, unique **per
  business**"). That makes plain email+password login ambiguous without a businessId. `lib/auth.ts`'s
  `findUsersByEmailAnyBusiness` looks up every account with that email across all businesses and
  checks the password against each — correct at this scale, but doesn't scale to a huge number of
  accounts sharing one email (extremely unlikely in practice: one person running many
  businesses under the same login email).
- **No "opening bank balance" field exists in the data model.** `getCurrentCashPosition`
  (`lib/financials.ts`) is purely cumulative: all-time payments in, minus all-time payments out,
  minus all-time expenses. The seed data adds a one-time "owner capital contribution" payment at
  the start of the simulated year as a stand-in for a real opening-balance concept — see
  `scripts/seed.ts`. A production version of this app would want an explicit `openingBalance`
  field on `Business` (or a ledger of capital transactions) rather than relying on seed-data
  trickery.
- **Task `assigneeId` and Employee are separate collections that aren't required to line up.**
  Tasks are assigned to `User` ids (people who can log in), not `Employee` ids (payroll records).
  An `Employee` can optionally link to a `User` via `linkedUserId`.
- **Permission "permissions" strings on Employee are illustrative, not enforced.** Real
  authorization throughout the app is role-based (`owner`/`manager`/`staff`/`accountant` via
  `lib/auth.ts`'s `requireRole`/`canView*`/`canEdit*` helpers, checked server-side on every route).
  The free-form `permissions: string[]` field on `Employee` is stored but nothing currently reads
  it to gate access — it's UI-visible on the Employee detail page as a settings surface, not a
  second authorization system layered on top of roles.
- **Onboarding's "what you sell" step doesn't persist anywhere.** There's no field in the data
  model for product categories collected before any products exist; that step is UX flavor
  (matches the spec's 3-step structure) and its input is discarded on submit. Documented inline in
  `app/onboarding/page.tsx`.
- **"Users & roles" on the Settings page is read-only for now.** There's no team invite/list API —
  building one needs an email-sending story (invite links) that's out of scope for this pass. The
  settings page shows the current user's own account and says so plainly rather than faking a
  member list.
- **Receipt "upload" on Expenses is a client-side `FileReader` → data URL**, not real object
  storage. It genuinely works (the file round-trips and is viewable), but doesn't belong in
  production at scale — a real deployment would swap this for S3/R2/Vercel Blob behind a signed
  upload URL. One line, easy to swap: `lib/types.ts`'s `receiptUrl: string` doesn't care whether
  the string is a data URL or a real object-storage URL.
- **Notification preferences are `localStorage`-only.** No backend field exists for them; the
  Settings page says so.

## What's genuinely NOT implemented (be honest about this)

- **No real deployment.** This environment has no Vercel account, no MongoDB Atlas cluster, and no
  Anthropic API key to deploy with. The app is fully built, typechecks clean, builds clean
  (`npm run build`), and was verified end-to-end against a real MongoDB (via `mongodb-memory-server`)
  including auth, every major page, cross-tenant isolation, PDF generation, and the copilot chat's
  keyword-fallback path. Follow `README.md`'s deploy section (or run `/deploy` if you're using
  Claude Code) with your own Atlas connection string and Vercel account to actually put it online.
- **No automated test suite.** Correctness was verified through direct exercise (typecheck, real
  build, a live server against real seeded data, curl-driven smoke tests of every route, an
  explicit cross-tenant-leak check) rather than a checked-in Jest/Vitest suite. Given the `lib/`
  layer is framework-free pure functions, it's straightforward to add unit tests later — that
  would be the first thing to build next.
- **No email sending anywhere** (invoice "send," invite flow, password reset). "Send invoice"
  marks it sent and logs a reminder-history entry; it does not dispatch a real email. This needs a
  transactional email provider (Resend, Postmark, SES) wired into a real deployment.
- **No password reset flow.**
- **LLM-driven insight phrasing.** The insights engine (`lib/insights.ts`) is fully deterministic
  by design — every rule, threshold, and number is plain code, and its wording is templated, not
  LLM-generated, even when `ANTHROPIC_API_KEY` is set. Only the Copilot **chat** actually calls the
  LLM. This was a deliberate scope call: it keeps insights reproducible and correct with zero API
  key, and the spec's own requirement ("rules and thresholds are deterministic code") is satisfied
  either way — LLM-polished insight prose would be a nice follow-up, not a correctness gap.

## Click paths through the major features

- **See the product working with zero setup:** `/login` → "Try the demo" → lands on `/dashboard`
  with a year of real seeded history, several live AI insights already computed.
- **Inventory intelligence:** `/inventory` → the "Reorder suggestions" panel at the top is driven
  by real `low_stock`/`stockout_risk` insights — click "Create PO" on one to actually create a
  purchase order via the normal `/api/purchase-orders` path (same validation as the manual flow).
- **The AI chat:** the floating "Ask Copilot" button (bottom-right, any page) or the full `/copilot`
  page. Ask "which products should I reorder" or "who owes me money" — with `ANTHROPIC_API_KEY`
  unset, this is answered by the keyword-routed fallback in `lib/copilot/llm.ts` hitting the exact
  same read-only data tools (`lib/copilot/tools.ts`) the LLM path would use.
- **A full order-to-cash loop:** `/sales` → New sale → pick a customer + products → the sale
  decrements stock immediately → open the sale → "Convert to invoice" → open the resulting invoice
  → "Record payment" → watch its status move draft → sent → partially_paid/paid, and the dashboard's
  receivables figure move with it.
- **Partial receiving:** `/purchases` → open any `sent`/`partially_received` PO → "Receive stock" →
  reduce a line's quantity below the full remaining amount → submit → the PO stays
  `partially_received` and the product's weighted-average cost updates.
- **Reconciliation check:** compare the Dashboard's profit figure for a date range against
  `/analytics` → P&L tab for the same range — both call the exact same `getProfitLoss()` in
  `lib/financials.ts`, so they always agree.

## Known limitations / what to build next

1. A real test suite (unit tests for `lib/`, integration tests for API routes).
2. Real object storage for expense receipts and business logos.
3. Transactional email (invoice sending, reminders, team invites, password reset).
4. A team-invite flow and a real "Users & roles" management screen.
5. An `openingBalance` concept on `Business` instead of the seed-data capital-injection workaround.
6. Rate limiting / abuse protection on auth routes (register/login currently have none beyond
   password hashing cost).
7. Multi-location inventory is modeled (`location` field throughout) but the UI only ever uses a
   single `'default'` location — multi-warehouse UI is unbuilt.
8. Barcode scanning input (a barcode field exists on `Product`, no scanner integration).
