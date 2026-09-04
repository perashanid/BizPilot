/**
 * All monetary amounts are integers in the smallest currency unit (e.g. cents).
 * Never do money arithmetic in floats. Format only at the UI edge.
 */

const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND', 'CLP', 'BIF', 'DJF', 'GNF', 'ISK', 'PYG', 'RWF', 'UGX', 'VUV', 'XAF', 'XOF', 'XPF']);

export function minorUnitsFor(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 0 : 2;
}

/** Converts a decimal string/number (e.g. "19.99") into integer minor units (1999). */
export function toMinorUnits(amount: number | string, currency: string): number {
  const decimals = minorUnitsFor(currency);
  const n = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10 ** decimals);
}

/** Converts integer minor units back into a decimal number for display or export. */
export function toMajorUnits(minorUnits: number, currency: string): number {
  const decimals = minorUnitsFor(currency);
  return minorUnits / 10 ** decimals;
}

export function formatMoney(minorUnits: number, currency: string, locale = 'en-US'): string {
  const value = toMajorUnits(minorUnits, currency);
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(minorUnitsFor(currency))}`;
  }
}

/** Percentage change, rounded to 1 decimal place. Returns null when the baseline is zero (undefined change). */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

export function marginPercent(salePrice: number, costPrice: number): number {
  if (salePrice <= 0) return 0;
  return Math.round(((salePrice - costPrice) / salePrice) * 1000) / 10;
}

/** Computes a line total in integer minor units: qty * unitPrice - discount, then adds tax. */
export function lineTotalWithTax(qty: number, unitPrice: number, discount: number, taxRatePercent: number): number {
  const base = qty * unitPrice - discount;
  const tax = Math.round(base * (taxRatePercent / 100));
  return base + tax;
}

export function lineSubtotal(qty: number, unitPrice: number, discount: number): number {
  return qty * unitPrice - discount;
}

export function taxForLine(qty: number, unitPrice: number, discount: number, taxRatePercent: number): number {
  return Math.round(lineSubtotal(qty, unitPrice, discount) * (taxRatePercent / 100));
}
