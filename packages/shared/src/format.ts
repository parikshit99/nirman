/**
 * Money as shown in India, "₹1,23,456.5": up to 2 decimals, or `whole` rupees. PDFs pass `symbol: 'Rs. '`
 * (their font has no ₹).
 */
export function formatRupees(n: number, { whole = false, symbol = '₹' }: { whole?: boolean; symbol?: string } = {}): string {
  const v = n || 0;
  return `${symbol}${whole ? Math.round(v).toLocaleString('en-IN') : v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/** A quantity: up to 3 decimals, Indian digit grouping ("1,250.125"). */
export const formatQty = (n: number) => Number((n || 0).toFixed(3)).toLocaleString('en-IN');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A day (YYYY-MM-DD) as "3 Sep 2026", or "3 Sep" without the year. Spelt out here rather than with
 * toLocaleDateString, whose en-IN months differ between engines ("Sept").
 */
export function formatDay(iso: string, { year = true }: { year?: boolean } = {}): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  if (!m || !month) return '';
  return `${Number(m[3])} ${month}${year ? ` ${m[1]}` : ''}`;
}
