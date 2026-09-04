# SME Copilot

## Inspiration

Small business owners are drowning in spreadsheets. They track inventory in Excel, invoices in QuickBooks, cash flow in their head, and still can't answer "why did my margin drop 3% last month?" without hours of manual detective work.

I wanted to build **a single workspace that connects every dot** — where the software itself can tell you that a margin decline traces back to a supplier price increase, or that your cash crunch is fixable if you just collect those three overdue invoices.

## What it does

**SME Copilot** is an AI-powered operating system for small and medium-sized businesses. It combines:

- **Sales, customers, products & inventory** — real-time stock tracking with automatic decrement/reversal on order confirm/cancel, weighted-average cost calculation, reorder-point alerts
- **Suppliers & purchasing** — purchase orders with partial receiving and supplier performance tracking
- **Invoicing & payments** — sequential invoice numbers, partial payments, overdue status, real PDF generation
- **Expenses** — categorized tracking with recurring expenses and receipt upload
- **Employees & tasks** — role-gated payroll visibility and drag-and-drop kanban board
- **Financial analytics** — P&L, margins, AR/AP aging, cash flow projection with runway estimates
- **AI Copilot chat** — natural language queries over your real data ("who owes me money?", "which products should I reorder?")
- **Proactive insights** — deterministic rules engine that flags stockouts, overdue invoices, cash runway warnings, margin declines, expense spikes, quiet customers, late suppliers

The AI layer **connects the dots across modules**: it can trace a margin drop to a supplier price increase, or link a cash crunch to overdue invoices — reasoning that would take hours in disconnected spreadsheets happens instantly.

## How I built it

**Stack**: Next.js 14 (App Router), TypeScript, MongoDB, Tailwind CSS, shadcn/ui components, Zod validation, Recharts, pdfkit, Gemini API

**Architecture**:
- Server-first with MongoDB aggregation pipelines for all financial analytics — everything reconciles to the same numbers everywhere
- Tool-calling AI chat using Gemini API with 8 read-only data tools scoped to your business
- HTTP-only session cookies with role-based permissions enforced server-side
- Auto-seeding system that generates 12 months of coherent demo data (318 sales, 150 invoices, 200 payments, 156 expenses) with deliberately baked-in stories for the AI to discover

**Key challenges**:
- Maintaining data consistency across interconnected modules (sales decrement inventory, payments update invoice balances, refunds reverse everything)
- Building a graceful fallback system — without an API key, the chat degrades to a keyword-routed tool caller that returns structured data instead of natural language
- Making deterministic insights feel intelligent without hallucination risk

## Challenges I ran into

1. **Consistency across cascading operations** — a sale confirms → inventory decrements → if cancelled → stock restores → but what if partially invoiced and partially paid? Built a state machine with explicit reversal logic at every step.

2. **Making AI insights trustworthy** — LLMs hallucinate numbers. Solution: insights are 100% deterministic code with real thresholds, only the *phrasing* in chat is LLM-generated. Every insight links to source data.

3. **Graceful degradation without an API key** — many AI demos are unusable without credentials. Built a keyword fallback that calls the same data tools directly — you get structured answers with real numbers, just not conversational prose.

## Accomplishments that I'm proud of

- **Real end-to-end business logic** — weighted-average inventory costing, sequential invoice numbering, partial payment allocation, AR aging buckets, cash runway projections. Nothing is mocked.
- **Data reconciliation everywhere** — the same invoice total shows identically on the invoice detail page, the payments table, the AR aging report, and the P&L. All backed by the same MongoDB aggregations.
- **Auto-seeding with narrative** — the demo data isn't random; it includes a supplier who's always late, a customer who went quiet after a big order, products with real margin declines. The AI has real stories to find.
- **Built the entire design system from scratch** — cohesive component library with consistent patterns across 40+ pages

## What I learned

- **LLMs need guardrails for financial data** — tool-calling with read-only functions and deterministic verification is the right pattern for business software
- **MongoDB aggregation pipelines are powerful** — complex financial reports (P&L with category rollups, AR aging, weighted cash projections) compile down to single database queries
- **Graceful degradation is a feature** — building the keyword fallback made the tool layer cleaner and the AI layer more testable
- **Small businesses need connected data more than they need more features** — the insight that matters is "your margin dropped *because* your top supplier raised prices 8%" — and you can't get that from disconnected tools

## What's next for SME Copilot

- **Automated test suite** — currently verified through direct exercise
- **Real email integration** — invoice sending, payment reminders, team invites
- **Multi-tenant deployment** — real onboarding flow, payment processing
- **Mobile app** — quick inventory checks, expense capture on the go
- **More AI actions** — draft POs from low-stock alerts, auto-categorize expenses from receipt OCR, suggest invoice payment plans based on cash projections
- **Forecasting** — ML-powered demand prediction, seasonality detection, inventory optimization

## Feature set

- **Sales, customers, products, inventory** — orders with real stock decrement/reversal on
  confirm/cancel/refund, weighted-average cost on receiving, reorder-point alerts.
- **Suppliers & purchasing** — POs with partial receiving.
- **Invoicing & payments** — sequential invoice numbers, partial payments, overpayment rejection,
  overdue status derived on read, real PDF invoice generation.
- **Expenses** — categories, recurring expenses generated on read, receipt upload.
- **Employees & tasks** — role-gated payroll visibility, a drag-and-drop kanban board.
- **Financial analytics** — P&L, margins, AR/AP aging, cash flow with a weighted projection and
  runway estimate, all backed by MongoDB aggregation pipelines, all reconciling to the same
  numbers everywhere they're shown.
- **Reports** — real CSV and PDF export for every report type.
- **AI Copilot** — a tool-calling chat over your real data (streams token by token) plus a fully
  deterministic proactive-insights engine (stock, overdue invoices, cash runway, margin decline,
  expense spikes, quiet customers, late suppliers, fast-selling products about to run out) — see
  "AI layer & graceful degradation" below.
- **Auth** — email/password with hashed credentials + HTTP-only session cookies, role-based
  permissions (owner/manager/staff/accountant) enforced server-side on every route, a one-click
  demo login, and a 3-step onboarding wizard.

## Stack

Next.js 14 (App Router) + TypeScript · MongoDB (official driver) · Tailwind + a hand-built
shadcn/ui-style component library · Zod validation on every API boundary · Recharts · pdfkit ·
papaparse. See `DESIGN.md` for the design system and `CONVENTIONS.md` for the code architecture.

## Running it locally

```bash
npm install
cp .env.example .env.local     # then fill in MONGODB_URI and SESSION_SECRET, see below
npm run dev
```

Open http://localhost:3000. **The app auto-seeds a realistic year of demo data on first start if
the database is empty** — no manual step required. If you'd rather do it yourself (or reseed
after wiping the DB): `npm run seed` (add `--force` to wipe and reseed a non-empty database).

You need a MongoDB instance to point `MONGODB_URI` at — either:

- A free **MongoDB Atlas** cluster (recommended, and what you'd use in production anyway):
  create one at https://www.mongodb.com/cloud/atlas, get its connection string, put it in
  `.env.local`.
- A **local `mongod`** — `MONGODB_URI=mongodb://127.0.0.1:27017/sme_copilot` works out of the box
  once one is running.

`SESSION_SECRET` just needs to be a long random string — generate one with `openssl rand -base64
32` or similar. See `.env.example` for every variable and what happens if the optional
`GEMINI_API_KEY` is left unset.

### Verifying it end-to-end without a real database

`npm run seed:memory` boots an in-memory MongoDB (`mongodb-memory-server`), runs the exact same
seed script, and asserts a handful of consistency invariants (invoice balances match their
payments, no negative stock, etc.) — useful for confirming the app's data logic works before you
have Atlas credentials set up.

## Demo login

Click **"Try the demo"** on the login screen — no signup required. It signs into a fully seeded
demo business ("Northside Hardware & Supply") with ~12 months of coherent history: 318 sales, 60
purchase orders, 150 invoices, 200 payments, 156 expenses, 10 employees, 30 tasks — including a
handful of deliberately baked-in stories (a product with a real margin decline, a supplier that
delivers late, a customer who's gone quiet, two products near stockout, an expense-category spike)
so the AI insights have genuine findings on first load, not placeholder text.

Manual login: `demo@smecopilot.app` / `demo1234`.

## AI layer & graceful degradation

Two surfaces:

1. **Copilot chat** (`/copilot`, or the floating "Ask Copilot" button on every page) — with
   `GEMINI_API_KEY` set, this is a real function-calling loop against the Gemini API:
   the model picks from eight read-only data tools (`lib/copilot/tools.ts`), the tools hit
   MongoDB scoped to your business, the model composes an answer from real numbers and streams it
   token by token.
2. **Proactive insights** (`/copilot` Insights tab, and the dashboard) — a fully deterministic
   rules engine (`lib/insights.ts`). Real thresholds, real numbers, real one-click actions (create
   a PO, send a reminder).

**Without `GEMINI_API_KEY`, nothing breaks.** The insights engine is deterministic code — it
runs exactly the same with or without a key. The chat falls back to a keyword-routed responder
(`lib/copilot/llm.ts`'s `keywordFallback`) that calls the same read-only tools directly and
returns a structured answer with the same stat/table/action blocks the LLM path produces, just
without free-form natural language. Try it: ask "which products should I reorder" or "who owes me
money" with no key configured.

## Deploying

This app targets Vercel (see `next.config.mjs` and the Vercel-serverless notes in
`CONVENTIONS.md`/the original spec — module-scoped Mongo client, Node.js runtime on every DB
route, no fetch waterfalls). At a high level:

1. Push this repo to GitHub, import it into Vercel.
2. Set the environment variables from `.env.example` in the Vercel project settings
   (`MONGODB_URI` pointed at a real Atlas cluster, `SESSION_SECRET`, optionally
   `GEMINI_API_KEY`/`GEMINI_MODEL`, `NEXT_PUBLIC_APP_URL` set to your deployed URL).
3. Deploy. The database auto-seeds on the first request that touches it if it's empty (see
   `instrumentation.ts` / `lib/auto-seed.ts`) — or run `npm run seed` locally pointed at your
   Atlas connection string before going live, if you'd rather seed it explicitly ahead of time.

If you're working in Claude Code, the `/deploy` skill will generate a fill-in-the-blanks
deployment guide tailored to this exact codebase.

**This build was not actually deployed** — the environment it was built in has no Vercel account,
Atlas cluster, or Gemini key of its own to deploy with. Everything above was verified instead
by building the app for production (`npm run build`, zero errors) and running it against a real
MongoDB with real seeded data, hitting every major page and API route, including an explicit
cross-tenant-data-leak check. See `NOTES.md` for the full verification notes.

## What's honestly not real / not done

- **No live deployment** (see above — bring your own Atlas/Vercel/Anthropic credentials).
- **No automated test suite.** Verified through direct exercise instead; see `NOTES.md`.
- **No real email sending** — "send invoice," reminders, and team invites don't dispatch real
  email (no provider wired in).
- **No password reset flow.**
- **Expense receipt "upload"** is a client-side file→data-URL round-trip, not real object storage
  (S3/R2/etc.) — it works, but wouldn't scale past a demo/small dataset.
- **"Users & roles" in Settings is read-only** — there's no team-invite API yet (needs the email
  story above).
- **Notification preferences** are `localStorage`-only, not a backend setting.
- **Insight *phrasing* is templated, not LLM-generated**, by design — the rules/thresholds/numbers
  are deterministic code either way (see "AI layer" above); only the chat calls an LLM.
- **No payment processor** — the Billing settings tab is an explicit placeholder.

Full list of assumptions and architecture rationale: `NOTES.md`. Design system: `DESIGN.md`.
Third-party licenses: `LICENSES.md`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server (auto-seeds an empty database) |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run typecheck` | `tsc --noEmit` across the whole project |
| `npm run lint` | ESLint |
| `npm run seed` | Seed the database (`--force` to wipe and reseed) |
| `npm run seed:memory` | Seed an in-memory MongoDB and assert data-consistency invariants |
