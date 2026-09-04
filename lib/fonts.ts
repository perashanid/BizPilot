/**
 * Font setup for SME Copilot.
 *
 * Three deliberate choices, none of them Inter:
 *  - Public Sans (--font-sans)   UI text: nav, labels, buttons, body copy, table cells.
 *                                 A GSA-commissioned civic/government typeface — built for dense,
 *                                 legible, no-nonsense interfaces. Reads as "operations software",
 *                                 not "AI demo".
 *  - Lora (--font-display)       Page titles and section headings only, used sparingly. A serif
 *                                 adds editorial weight and seriousness to a financial product
 *                                 without resorting to a gradient hero. Never used for body text
 *                                 or UI chrome.
 *  - IBM Plex Mono (--font-mono) Numerals, currency amounts, ids, timestamps, code-like data.
 *                                 Tabular figures by default, which keeps stacked money columns
 *                                 perfectly aligned — critical for a finance-heavy UI.
 *
 * Import `fontSans`, `fontDisplay`, `fontMono` in app/layout.tsx and spread their `.variable`
 * classes onto the root <html> element, e.g.:
 *
 *   <html className={cn(fontSans.variable, fontDisplay.variable, fontMono.variable)}>
 *
 * Do not import next/font/google anywhere else — this is the single source of truth for
 * typography loading.
 */
import { Public_Sans, Lora, IBM_Plex_Mono } from 'next/font/google';

export const fontSans = Public_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

export const fontDisplay = Lora({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['500', '600', '700'],
});

export const fontMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  weight: ['400', '500', '600'],
});
