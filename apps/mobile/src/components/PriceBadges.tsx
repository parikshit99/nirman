import type { PricePoint } from '@nirman/shared';

export const rupees = (n: number) => `₹${(n || 0).toLocaleString('en-IN')}`;
export const pct = (x: number) => `${x > 0 ? '+' : ''}${Math.round(x * 100)}%`;
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });

/** "+8% vs last ₹360 (1 Sep, Sharma)": red when dearer, green when cheaper. */
export function VsLastBadge({ vsLast, last }: { vsLast: number | null; last: PricePoint | null }) {
  if (vsLast === null || !last) return null;
  const tone = Math.abs(vsLast) < 0.005 ? 'bg-gray-100 text-gray-600' : vsLast > 0 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700';
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${tone}`} title={`Last recorded ${rupees(last.price)} on ${shortDate(last.date)} from ${last.vendor}`}>
      {pct(vsLast)} vs last {rupees(last.price)} ({shortDate(last.date)}, {last.vendor})
    </span>
  );
}

/** Tiny price-over-time line. */
export function Sparkline({ points, width = 64, height = 18 }: { points: PricePoint[]; width?: number; height?: number }) {
  if (points.length < 2) return null;
  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const span = Math.max(...prices) - min || 1;
  const xy = prices.map((p, i) => `${((i / (prices.length - 1)) * (width - 2) + 1).toFixed(1)},${(height - 1 - ((p - min) / span) * (height - 2)).toFixed(1)}`);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Price trend: ${prices.map(rupees).join(', ')}`}>
      <polyline points={xy.join(' ')} fill="none" stroke="#FF7A00" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
