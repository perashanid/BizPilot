# SME Copilot — Design System

Calm, dense, professional financial-operations aesthetic. Deliberately not a generic AI-SaaS
template: no purple-to-blue gradients, no glassmorphism, no oversized hero sections, no
Inter-only typography. Everything below is implemented in `app/globals.css`,
`tailwind.config.ts`, `lib/fonts.ts`, `lib/utils.ts`, and `components/ui/*`. Build every screen
out of these — don't invent one-off styles or a second component library (see CONVENTIONS.md).

## Color tokens

All colors are CSS variables as **HSL triplets** (no `hsl()` wrapper) in `app/globals.css`,
consumed by Tailwind via `hsl(var(--token))`. Light mode is `:root`; dark mode is `.dark`
(class-based, toggled on `<html>`).

| Token | Light (HSL) | Dark (HSL) | Use |
|---|---|---|---|
| `--background` | `210 20% 98%` | `215 28% 7%` | page background |
| `--foreground` | `215 28% 12%` | `210 20% 96%` | default text |
| `--card` | `0 0% 100%` | `215 25% 10%` | card/panel surface |
| `--card-foreground` | `215 28% 12%` | `210 20% 96%` | text on cards |
| `--popover` | `0 0% 100%` | `215 25% 10%` | menus, dropdowns, dialogs |
| `--popover-foreground` | `215 28% 12%` | `210 20% 96%` | text in popovers |
| `--primary` | `192 84% 20%` (deep teal) | `186 72% 45%` | brand accent, primary buttons, links, focus ring |
| `--primary-foreground` | `210 40% 98%` | `215 28% 8%` | text on primary |
| `--secondary` | `210 16% 93%` | `215 20% 16%` | secondary button surface |
| `--secondary-foreground` | `215 28% 16%` | `210 20% 92%` | text on secondary |
| `--muted` | `210 16% 93%` | `215 20% 16%` | subtle backgrounds, disabled, skeletons |
| `--muted-foreground` | `215 15% 40%` | `215 15% 65%` | captions, secondary text |
| `--accent` | `205 25% 92%` | `215 20% 18%` | hover/highlight bg in menus & list items (not the brand color) |
| `--accent-foreground` | `215 28% 14%` | `210 20% 94%` | text on accent |
| `--success` | `142 71% 29%` | `142 60% 45%` | positive financial values, paid/fulfilled/done |
| `--warning` | `38 92% 40%` | `38 92% 55%` | attention needed, due soon, low stock |
| `--destructive` | `0 72% 42%` | `0 72% 58%` | negative financial values, overdue/blocked/delete |
| `--border` / `--input` | `210 16% 88%` / `210 16% 85%` | `215 20% 20%` / `215 20% 22%` | dividers, field borders |
| `--ring` | `192 84% 20%` | `186 72% 45%` | focus ring (matches primary) |
| `--radius` | `0.5rem` | `0.5rem` | base corner radius |

**Why teal, not indigo/purple.** A deep teal reads as ledgers, ink, trust — distinct from both
the generic AI purple-blue gradient and from the `--success` green, so "brand accent" and
"this number is good" are never visually confused. It's a single strong color, never a gradient.

Never hardcode hex values in components — always the Tailwind tokens (`bg-primary`,
`text-destructive`, `border-border`, etc.).

## Typography

Three Google Fonts, loaded once in `lib/fonts.ts` via `next/font/google`, exposed as CSS
variables (`fontSans.variable`, `fontDisplay.variable`, `fontMono.variable`) that
`app/layout.tsx` applies to `<html>`. None is Inter.

- **Public Sans** → `--font-sans` / `font-sans` (default). UI text: nav, labels, buttons, body
  copy, table cells. A GSA-commissioned civic/government typeface designed for dense, legible
  interfaces — it reads as operations software, not an AI demo.
- **Lora** → `--font-display` / `font-display`. Page titles and section/card headings **only**,
  used sparingly. A serif gives a financial product editorial weight and seriousness without a
  gradient hero. Never use for body text, table data, or buttons.
- **IBM Plex Mono** → `--font-mono` / `font-mono`. Numerals, currency amounts, ids, timestamps.
  Tabular figures by default, so stacked money columns stay perfectly aligned.

### Type scale

| Tailwind class | Font | Use |
|---|---|---|
| `text-2xl font-display font-semibold` | Lora | Page title (top of a screen, one per page) |
| `text-lg font-display font-semibold` | Lora | Section heading (`CardTitle` default) |
| `text-sm font-semibold` | Public Sans | Card/subsection title where a serif is too heavy |
| `text-sm` | Public Sans | Body copy, form labels, table cell text |
| `text-xs text-muted-foreground` | Public Sans | Captions, helper text, table column headers (uppercase, tracked) |
| `font-mono tabular-nums` | IBM Plex Mono | Any number: money, quantities, percentages, ids, dates in tables |

## Spacing convention

Stick to the default Tailwind scale (4px increments) with these conventions:
- Page container: the root `container` class (already configured with `1rem` padding, centered,
  `2xl: 1400px` max width) — don't hand-roll page gutters.
- Card padding: `p-6` (via `CardHeader`/`CardContent`/`CardFooter`, which already apply it) —
  don't override to something tighter/looser per screen.
- Vertical rhythm between stacked sections on a page: `space-y-6`.
- Gaps inside a toolbar/filter row: `gap-3` (`sm`) between related controls, `gap-6` between
  unrelated groups.
- Dense data tables use the `TableCell`/`TableHead` default `p-3`; don't shrink it further —
  legibility over max density.

## Component patterns

### Buttons (`components/ui/button.tsx`)
- `default` (primary/teal) — the one primary action per view (Save, Create, Send).
- `secondary` — the standard secondary action next to a primary one (Cancel that isn't destructive, Export).
- `outline` — toolbar/filter actions, "Edit" triggers, low-emphasis actions in a row of buttons.
- `ghost` — icon-only or inline actions inside tables/menus where a border would add noise.
- `destructive` — irreversible/dangerous actions (Delete, Void, Cancel order). Always pair with a confirming `Dialog`.
- `link` — inline text-styled action inside prose or a table cell.
- Sizes: `sm` for inside tables/toolbars, `default` for forms/dialogs, `lg` for a page's single hero CTA (rare), `icon` for square icon buttons.

### Cards
`Card` + `CardHeader`/`CardTitle`/`CardDescription` + `CardContent` (+ `CardFooter` for actions).
Padding is baked in (`p-6`, header `pb-0` via `space-y-1.5`) — don't add extra padding wrappers.

### Badges / status pills (`components/ui/badge.tsx`)
This is **the** status vocabulary. Every screen — orders, invoices, purchase orders, tasks,
inventory — reuses these six variants instead of inventing new pill colors:

| Variant | Business statuses |
|---|---|
| `success` | paid, fulfilled, received, done, active, completed |
| `secondary` | sent, pending, in_progress, awaiting, confirmed (neutral "in motion") |
| `warning` | due soon, low stock, at-risk, opportunity/attention-needed |
| `destructive` | overdue, critical, blocked, cancelled, failed |
| `outline` | draft |
| `default` | used sparingly for brand-tinted emphasis (e.g. "New") — not a status color |

Note: `deriveInvoiceStatus`/`withDerivedStatus` in `lib/invoicing.ts` computes "overdue" at read
time — map that derived status straight to the `destructive` badge variant.

### Tables (`components/ui/table.tsx`)
Plain styled `<table>`, no data-grid library. Column headers are uppercase/tracked/muted by
default. **Numeric columns** (money, quantities, percentages) must add `text-right tabular-nums`
(and typically `font-mono`) to both the `TableHead` and `TableCell` at the call site — the
primitive does not guess which columns are numeric. On narrow screens (<640px), stack table rows
as cards per CONVENTIONS.md rather than horizontally scrolling a dense table.

### Modals (`components/ui/dialog.tsx`)
Radix Dialog underneath — focus trap and Escape-to-close come for free, don't fight them. Use
`DialogHeader` (`DialogTitle` + optional `DialogDescription`) + body content + `DialogFooter`
with `secondary`/`outline` Cancel on the left, primary or `destructive` confirm on the right.

### Toasts (`components/ui/toast.tsx`, `toaster.tsx`, `use-toast.ts`)
The system for success/error feedback on every mutation. **`<Toaster />` must be mounted once in
the root layout** (`app/layout.tsx`), near the end of `<body>`. Anywhere in a client component:

```tsx
const { toast } = useToast();
toast({ title: 'Invoice sent', variant: 'success' });
toast({ title: 'Could not save', description: err.message, variant: 'destructive' });
```

Variants: `default` (neutral), `success`, `destructive`, `warning` — mirror the badge semantics.

### Loading / empty / error states
Every async view needs all three (never a bare spinner on a blank page):
- **Loading** → `Skeleton` blocks shaped like the eventual content (e.g. a few `h-4 w-full` rows
  for a table, a `h-24` block for a card).
- **Empty** → `EmptyState` (`components/ui/empty-state.tsx`) — icon (lucide-react) + title +
  description + optional `action` button that starts the relevant flow.
- **Error** → `ErrorState` (`components/ui/error-state.tsx`) — human message + `onRetry` button.

## Money & dates

- Money is always rendered with `formatMoney(minorUnits, business.currency)` from `lib/money.ts`
  — never format currency by hand, never do money math in floats.
- Every money value in UI gets the `.tabular-nums` utility class (defined in `globals.css`) so
  digits align in columns; in tables, combine with `text-right`: `className="text-right tabular-nums font-mono"`.
- Dates: **one format for the whole app** — `MMM d, yyyy` (e.g. `Sep 3, 2026`) via `date-fns`'s
  `format(date, 'MMM d, yyyy')`. Use `MMM d, yyyy h:mm a` only where a timestamp (not just a day)
  is meaningful, e.g. audit log entries. Don't introduce a third date format.

## Files in this design system

- `app/globals.css` — Tailwind layers, all CSS variable tokens (light + dark), `.tabular-nums`, focus-visible ring.
- `lib/fonts.ts` — Public Sans / Lora / IBM Plex Mono via `next/font/google`.
- `lib/utils.ts` — `cn()`.
- `components/ui/*` — primitives listed in CONVENTIONS.md; see each file for its exact exports.
