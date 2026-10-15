// ---------------------------------------------------------------------------
// Transport and loading charges on a bill. They are lines of their own ("Freight 1500", "Hamali 300"), counted in
// what was spent and in the site report, but they are not materials: they never go into Rates, and are never added
// into another line's price.
// ---------------------------------------------------------------------------

export const TRANSPORT = 'Transport';
export const LOADING = 'Loading and unloading';
/** The unit a charge is counted in when the bill gives none. */
export const TRIP = 'trip';

export type ChargeKind = 'transport' | 'loading';

/** Words that name each charge on bills, as whole words. "Tractor", "tempo" and "truck" alone are units, not charges. */
const CHARGE_WORDS: { kind: ChargeKind; name: string; words: string[] }[] = [
  {
    kind: 'transport',
    name: TRANSPORT,
    words: [
      'transport', 'transportation', 'freight', 'cartage', 'bhada', 'bhaada', 'bhara', 'gaadi bhada',
      'truck bhada', 'tractor bhada', 'tempo bhada', 'truck charges', 'tractor charges', 'tempo charges', 'delivery charges',
    ],
  },
  { kind: 'loading', name: LOADING, words: ['loading', 'unloading', 'loading unloading', 'hamali', 'hammali', 'palledari', 'chadhai', 'utrai'] },
];

/** "Sand incl. transport" is sand bought with its transport in the price, not a transport line. */
const INCLUDED = /\b(with|incl|including|inclusive|included)\b/;

const words = (text: string) => ` ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;

/** The standard charge name a line's name means ("Gaadi bhada" → Transport, "Hamali" → Loading and unloading), or null. */
export function chargeName(name: string | null | undefined): string | null {
  const text = words(name ?? '');
  if (!text.trim() || INCLUDED.test(text)) return null;
  // The word written first decides ("Loading and transport" is loading).
  let best: { name: string; at: number } | null = null;
  for (const c of CHARGE_WORDS) {
    for (const w of c.words) {
      const at = text.indexOf(` ${w} `);
      if (at >= 0 && (!best || at < best.at)) best = { name: c.name, at };
    }
  }
  return best?.name ?? null;
}

/** Whether a line is a transport or loading charge, from its standard name (after learned corrections). */
export function chargeKind(name: string | null | undefined): ChargeKind | null {
  const n = (name ?? '').trim().toLowerCase();
  return CHARGE_WORDS.find((c) => c.name.toLowerCase() === n)?.kind ?? null;
}

export const isCharge = (name: string | null | undefined) => chargeKind(name) !== null;
