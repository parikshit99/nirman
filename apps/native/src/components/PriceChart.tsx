import { useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from './ui/Pressable';
import Svg, { Circle, Defs, LinearGradient, Path, Polyline, Stop } from 'react-native-svg';
import type { PricePoint } from '@nirman/shared';
import { useColors } from '../theme';
import { rupees, shortDate } from './PriceBadges';

/** Price over time as a filled line; tap it to read the price and date nearest to the finger. */
export function PriceChart({ points, height = 48, id }: { points: PricePoint[]; height?: number; id: string }) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  if (points.length < 2) return null;
  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const span = Math.max(...prices) - min || 1;
  const pad = 4;
  const x = (i: number) => pad + (i / (points.length - 1)) * Math.max(1, width - pad * 2);
  const y = (p: number) => height - pad - ((p - min) / span) * (height - pad * 2);
  const line = prices.map((p, i) => `${x(i).toFixed(1)},${y(p).toFixed(1)}`);
  const area = `M${x(0).toFixed(1)},${height} L${line.join(' L')} L${x(points.length - 1).toFixed(1)},${height} Z`;
  const pick = (locationX: number) => setPicked(Math.max(0, Math.min(points.length - 1, Math.round(((locationX - pad) / Math.max(1, width - pad * 2)) * (points.length - 1)))));
  const at = picked === null ? null : points[picked];
  return (
    <View accessibilityLabel={`Price chart: ${prices.map(rupees).join(', ')}`}>
      <Pressable onLayout={(e) => setWidth(e.nativeEvent.layout.width)} onPress={(e) => pick(e.nativeEvent.locationX)} style={{ height }}>
        {width > 0 && (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="5%" stopColor={c.brandPrimary} stopOpacity={0.3} />
                <Stop offset="95%" stopColor={c.brandPrimary} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={area} fill={`url(#fill-${id})`} />
            <Polyline points={line.join(' ')} fill="none" stroke={c.brandPrimary} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {picked !== null && <Circle cx={x(picked)} cy={y(points[picked].price)} r={4} fill={c.brandPrimary} />}
          </Svg>
        )}
      </Pressable>
      {at && (
        <Text style={{ fontSize: 12, color: c.gray600 }}>
          {rupees(at.price)} · {shortDate(at.date)}
          {at.vendor ? ` · ${at.vendor}` : ''}
        </Text>
      )}
    </View>
  );
}
