// The app's accent colour. The orange shades (orange50 … orange900) and brandPrimary are worked out again from any
// one colour, so the whole app follows a colour chosen in Settings (or the phone's wallpaper colour). Red, green and
// blue keep their meaning and don't change. Worked in OKLCH, so each shade keeps the lightness of the orange shade it
// replaces: text and backgrounds stay as readable as they are in orange.

export const ACCENT_STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'] as const;
export type AccentStep = (typeof ACCENT_STEPS)[number];
export type AccentKey = `orange${AccentStep}` | 'brandPrimary';
/** The accent shades of one mode (light or dark), as in the app's palette. */
export type AccentShades = Record<AccentKey, string>;

/** Nirman's orange, in light and dark mode: the app's palette (`apps/native/src/theme.ts`) takes its shades from here. */
export const ORANGE: { light: AccentShades; dark: AccentShades } = {
  light: {
    brandPrimary: '#ff7a00',
    orange50: '#fff7ed',
    orange100: '#ffedd4',
    orange200: '#ffd6a7',
    orange300: '#ffb86a',
    orange400: '#ff8904',
    orange500: '#ff6900',
    orange600: '#f54900',
    orange700: '#ca3500',
    orange800: '#9f2d00',
    orange900: '#7e2a0c',
  },
  dark: {
    brandPrimary: '#ff7a00',
    orange50: '#381f11',
    orange100: '#4e270d',
    orange200: '#773a10',
    orange300: '#ffb86a',
    orange400: '#ff8904',
    orange500: '#ff6900',
    orange600: '#ff822a',
    orange700: '#ff9e53',
    orange800: '#ffb777',
    orange900: '#ffd1a3',
  },
};

/** The colours offered in Settings. The first is Nirman's own orange, the default. */
export const ACCENTS: { id: string; label: string; hex: string }[] = [
  { id: 'orange', label: 'Orange', hex: '#ff7a00' },
  { id: 'red', label: 'Red', hex: '#e53935' },
  { id: 'pink', label: 'Pink', hex: '#d81b60' },
  { id: 'purple', label: 'Purple', hex: '#8e24aa' },
  { id: 'indigo', label: 'Indigo', hex: '#3f51b5' },
  { id: 'blue', label: 'Blue', hex: '#1e88e5' },
  { id: 'teal', label: 'Teal', hex: '#00897b' },
  { id: 'green', label: 'Green', hex: '#43a047' },
  { id: 'lime', label: 'Lime', hex: '#afb42b' },
  { id: 'amber', label: 'Amber', hex: '#f9b81b' },
  { id: 'brown', label: 'Brown', hex: '#795548' },
  { id: 'grey', label: 'Grey', hex: '#546e7a' },
];

/** Text and icons on an accent background: white or near-black, whichever reads better. */
const LIGHT_TEXT = '#ffffff';
const DARK_TEXT = '#121212';

// How far each shade follows the chosen colour's own lightness (500 is the colour itself). The pale shades are
// backgrounds and stay as pale as orange's; 600 and darker are used for text, so they keep orange's lightness and
// stay readable.
const FOLLOW: Record<AccentStep, number> = { '50': 0, '100': 0.2, '200': 0.4, '300': 0.7, '400': 0.9, '500': 1, '600': 0, '700': 0, '800': 0, '900': 0 };

/**
 * The accent shades for `seed` in one mode. `ref` is that mode's orange shades, `background` its card colour (to keep
 * brandPrimary visible on it). Nirman's own orange gives `ref` back unchanged.
 */
export function accentShades(seed: string, ref: AccentShades, background: string): AccentShades {
  const color = normalizeHex(seed);
  if (!color) throw new Error(`Not a colour: ${seed}`);
  if (color === normalizeHex(ref.brandPrimary)) return { ...ref };
  const s = toOklch(color);
  const o = toOklch(ref.brandPrimary);
  // A grey colour gives grey shades; a very bright one doesn't get brighter than orange's by more than half again.
  const chroma = Math.min(s.c / Math.max(o.c, 1e-6), 1.5);
  const out = { brandPrimary: visibleOn(color, background) } as AccentShades;
  // 500 sits beside brandPrimary (picked chips, the Add button pressed), so it moves with it when that was adjusted.
  const primaryL = toOklch(out.brandPrimary).l;
  const refs = ACCENT_STEPS.map((step) => toOklch(ref[`orange${step}`]));
  const ls = ACCENT_STEPS.map((step, i) => (step === '500' ? primaryL + (refs[i].l - o.l) : refs[i].l + (s.l - o.l) * FOLLOW[step]));
  // Each shade stays on the same side of the one before it as in orange (600 darker than 500 in light mode, lighter in
  // dark), working outwards from 500.
  const mid = ACCENT_STEPS.indexOf('500');
  for (const [from, to, by] of [[mid + 1, ACCENT_STEPS.length, 1], [mid - 1, -1, -1]]) {
    for (let i = from; i !== to; i += by) {
      const gap = refs[i].l - refs[i - by].l;
      if (Math.sign(ls[i] - ls[i - by]) !== Math.sign(gap) || Math.abs(ls[i] - ls[i - by]) < Math.abs(gap) / 2) ls[i] = ls[i - by] + gap / 2;
    }
  }
  ACCENT_STEPS.forEach((step, i) => {
    let shade = fromOklch({ l: clamp(ls[i], 0.05, 0.98), c: refs[i].c * chroma, h: s.h });
    // Shades used for text (600 and darker) read at least as well on the cards as orange's do.
    if (FOLLOW[step] === 0 && i > mid) shade = readableAs(shade, contrast(ref[`orange${step}`], background), background);
    out[`orange${step}`] = shade;
  });
  return out;
}

/** `color`, moved in lightness away from `background` until their contrast is at least `target`. */
function readableAs(color: string, target: number, background: string): string {
  const c = toOklch(color);
  const step = luminance(background) > 0.5 ? -0.01 : 0.01;
  let next = color;
  for (let i = 1; i <= 60 && contrast(next, background) < target; i++) next = fromOklch({ ...c, l: clamp(c.l + step * i, 0, 1) });
  return next;
}

/** The colour for text and icons on brandPrimary and orange500 (buttons, the Add button, picked chips). */
export function textOn(shades: AccentShades): string {
  const backs = [shades.brandPrimary, shades.orange500];
  const worst = (text: string) => Math.min(...backs.map((b) => contrast(text, b)));
  // White whenever it reads well enough (3:1, as for large text and icons), as most apps do; else the better of the two.
  return worst(LIGHT_TEXT) >= 3 || worst(LIGHT_TEXT) >= worst(DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT;
}

/** WCAG contrast ratio of two colours (1 to 21). */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** `#rrggbb` in lower case, from `#rgb` or `#rrggbb` (with or without `#`); null if it isn't a colour. */
export function normalizeHex(value: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((d) => d + d).join('') : m[1];
  return `#${h.toLowerCase()}`;
}

// brandPrimary draws lines, icons and the picked tab on cards: a colour too close to the card's (amber on white, indigo
// on dark grey) is moved in lightness until it stands out at least as much as Nirman's orange does on white (2.5:1).
function visibleOn(color: string, background: string): string {
  return readableAs(color, 2.5, background);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function luminance(hex: string): number {
  const [r, g, b] = toLinear(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function toLinear(hex: string): [number, number, number] {
  const h = normalizeHex(hex) ?? '#000000';
  return [1, 3, 5].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
}

interface Oklch {
  l: number;
  c: number;
  h: number;
}

export function toOklch(hex: string): Oklch {
  const [r, g, b] = toLinear(hex);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

function oklchToLinear({ l, c, h }: Oklch): [number, number, number] {
  const A = c * Math.cos((h * Math.PI) / 180);
  const B = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

const inGamut = (rgb: number[]) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** The nearest sRGB colour: lowers the chroma (keeping lightness and hue) until it fits. */
export function fromOklch(color: Oklch): string {
  let rgb = oklchToLinear(color);
  if (!inGamut(rgb)) {
    let [lo, hi] = [0, color.c];
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinear({ ...color, c: mid }))) lo = mid;
      else hi = mid;
    }
    rgb = oklchToLinear({ ...color, c: lo });
  }
  return `#${rgb
    .map((v) => {
      const x = clamp(v, 0, 1);
      const srgb = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
      return Math.round(clamp(srgb, 0, 1) * 255)
        .toString(16)
        .padStart(2, '0');
    })
    .join('')}`;
}
