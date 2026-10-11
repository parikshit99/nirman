import { Text } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import type { PricePoint } from '@nirman/shared';
import { useColors } from '../theme';
import { rupees } from '../lib/format';

export const pct = (x: number) => `${x > 0 ? '+' : ''}${Math.round(x * 100)}%`;
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });

/** "+8% vs last ₹360 (1 Sep, Sharma)": red when dearer, green when cheaper. `projectId`: the project being priced; a last price from another site says which. */
export function VsLastBadge({ vsLast, last, projectId }: { vsLast: number | null; last: PricePoint | null; projectId?: string }) {
  const c = useColors();
  if (vsLast === null || !last) return null;
  const where = projectId && last.projectId && last.projectId !== projectId ? `, at ${last.site || 'another site'}` : '';
  const tone = Math.abs(vsLast) < 0.005 ? { bg: c.gray100, fg: c.gray600 } : vsLast > 0 ? { bg: c.red50, fg: c.red600 } : { bg: c.green50, fg: c.green700 };
  return (
    <Text accessibilityHint={`Last recorded ${rupees(last.price)} on ${shortDate(last.date)} from ${last.vendor}`} style={{ alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, fontSize: 12, fontWeight: '700', backgroundColor: tone.bg, color: tone.fg }}>
      {pct(vsLast)} vs last {rupees(last.price)} ({shortDate(last.date)}, {last.vendor}
      {where})
    </Text>
  );
}

/** Tiny price-over-time line. */
export function Sparkline({ points, width = 64, height = 18 }: { points: PricePoint[]; width?: number; height?: number }) {
  const c = useColors();
  if (points.length < 2) return null;
  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const span = Math.max(...prices) - min || 1;
  const xy = prices.map((p, i) => `${((i / (prices.length - 1)) * (width - 2) + 1).toFixed(1)},${(height - 1 - ((p - min) / span) * (height - 2)).toFixed(1)}`);
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} accessibilityLabel={`Price trend: ${prices.map(rupees).join(', ')}`}>
      <Polyline points={xy.join(' ')} fill="none" stroke={c.brandPrimary} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}
