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
