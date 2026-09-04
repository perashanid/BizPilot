# Third-party licenses

BizPilot is built with the open-source packages, fonts, and icon set below. This file lists
every runtime and build-time dependency declared in `package.json`, plus the fonts and icons used
in the UI. License identifiers are the SPDX id used in each package's own `package.json`/license
file at the time of writing — always verify against the installed version if this matters for a
compliance review.

## Runtime dependencies

| Package | License | Purpose |
|---|---|---|
| next | MIT | Application framework (App Router, API routes, bundling) |
| react / react-dom | MIT | UI rendering |
| mongodb | Apache-2.0 | Official MongoDB Node.js driver |
| bcryptjs | MIT | Password hashing |
| jose | MIT | JWT signing/verification for session cookies |
| zod | MIT | Runtime schema validation |
| clsx | MIT | Conditional className composition |
| tailwind-merge | MIT | Merging conflicting Tailwind classes |
| class-variance-authority | Apache-2.0 | Component style variants |
| lucide-react | ISC | Icon set (see "Icons" below) |
| recharts | MIT | Charting library |
| @radix-ui/react-* (dialog, dropdown-menu, select, tabs, label, checkbox, switch, avatar, toast, popover, slot, scroll-area, progress) | MIT | Accessible unstyled UI primitives underlying `components/ui/*` |
| date-fns | MIT | Date formatting/arithmetic |
| pdfkit | MIT | Server-side PDF generation (invoices, reports) |
| papaparse | MIT | CSV generation for report export |
| dotenv | BSD-2-Clause | Loads `.env` files for local scripts |

## Development dependencies

| Package | License |
|---|---|
| typescript | Apache-2.0 |
| tailwindcss | MIT |
| postcss | MIT |
| autoprefixer | MIT |
| tailwindcss-animate | MIT |
| eslint | MIT |
| eslint-config-next | MIT |
| tsx | MIT |
| mongodb-memory-server | MIT |
| @types/node, @types/react, @types/react-dom, @types/bcryptjs, @types/pdfkit, @types/papaparse | MIT |

## Fonts

Loaded via `next/font/google` in `lib/fonts.ts` (self-hosted at build time, no runtime call to
Google's servers):

| Font | License | Use |
|---|---|---|
| Public Sans | SIL Open Font License 1.1 | UI text (`--font-sans`) |
| Lora | SIL Open Font License 1.1 | Headings/display (`--font-display`) |
| IBM Plex Mono | SIL Open Font License 1.1 | Tabular numerals/data (`--font-mono`) |

## Icons

- **Lucide** (via `lucide-react`) — ISC License. https://lucide.dev

## AI provider

- **Anthropic Messages API** (Claude) — used optionally by `lib/copilot/llm.ts` when
  `ANTHROPIC_API_KEY` is set. This is a hosted API call, not a bundled dependency; its use is
  governed by Anthropic's own terms of service, not an OSS license.
