import { prefs } from './prefs.ts';

/**
 * How much Gemini this phone has used: every request sent to it (a reading, a quote, Test key), by IST day and
 * model, with Google's token counts. Kept only on the phone (the small key-value store), never in backups or
 * problem reports. The same key used elsewhere isn't counted, so Google's own figures may differ.
 */

/** One request to Gemini, as `createGeminiExtractor` and `testGeminiKey` report it. */
export interface GeminiCall {
  model: string;
  /** False when Gemini turned it away or didn't answer (rate limit, timeout, unknown model, rejected key). */
  ok: boolean;
  /** Tokens sent: the instructions, the text and the photos. */
  sent: number;
  /** Tokens in the answer, its thinking included. */
  answered: number;
}

export interface UsageCounts {
  requests: number;
  failed: number;
  sent: number;
  answered: number;
}

export interface UsageDay extends UsageCounts {
  /** YYYY-MM-DD in IST. */
  day: string;
}

export interface UsageMonth extends UsageCounts {
  /** YYYY-MM in IST. */
  month: string;
  /** The month per model, most requests first. */
  models: (UsageCounts & { model: string })[];
}

/** Day (YYYY-MM-DD, IST) → model → counts. */
type Stored = Record<string, Record<string, UsageCounts>>;

export const GEMINI_USAGE_KEY = 'geminiUsage';
/** Enough for 13 whole months, the longest view. */
export const GEMINI_USAGE_DAYS = 400;
const DAY_MS = 24 * 60 * 60 * 1000;
const IST_MS = 330 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The IST date of a moment, whatever the phone's time zone. */
export const istDay = (at: Date) => new Date(at.getTime() + IST_MS).toISOString().slice(0, 10);
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

const empty = (): UsageCounts => ({ requests: 0, failed: 0, sent: 0, answered: 0 });
function add(to: UsageCounts, from: UsageCounts) {
  to.requests += from.requests;
  to.failed += from.failed;
  to.sent += from.sent;
  to.answered += from.answered;
}

const load = (): Stored => prefs.get<Stored>(GEMINI_USAGE_KEY, {});
const listeners = new Set<() => void>();

/** Called after every counted request, so an open Settings shows it at once. */
export function onGeminiUsage(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** Count one request on its IST day, and forget days older than 400. */
export function recordGeminiUsage(call: GeminiCall, at = new Date()) {
  const stored = load();
  const day = istDay(at);
  const counts = (stored[day] ??= {})[call.model] ?? empty();
  add(counts, { requests: 1, failed: call.ok ? 0 : 1, sent: Math.max(0, call.sent), answered: Math.max(0, call.answered) });
  stored[day][call.model] = counts;
  const oldest = addDays(day, 1 - GEMINI_USAGE_DAYS);
  for (const d of Object.keys(stored)) if (d < oldest) delete stored[d];
  prefs.set(GEMINI_USAGE_KEY, stored);
  for (const fn of listeners) fn();
}

const total = (models: Record<string, UsageCounts>) => {
  const sum = empty();
  for (const counts of Object.values(models)) add(sum, counts);
  return sum;
};

export const geminiUsageToday = (now = new Date()): UsageCounts => total(load()[istDay(now)] ?? {});

/** The last `days` IST days with requests, newest first. */
export function geminiUsageDays(now = new Date(), days = 60): UsageDay[] {
  const stored = load();
  const today = istDay(now);
  const oldest = addDays(today, 1 - days);
  return Object.keys(stored)
    .filter((d) => d >= oldest && d <= today)
    .sort()
    .reverse()
    .map((day) => ({ day, ...total(stored[day]) }))
    .filter((d) => d.requests > 0);
}

/** This month and the 12 before it (IST) that have requests, newest first, each split per model. */
export function geminiUsageMonths(now = new Date(), months = 13): UsageMonth[] {
  const today = istDay(now);
  const [y, m] = today.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - months, 1)).toISOString().slice(0, 7);
  const byMonth = new Map<string, Map<string, UsageCounts>>();
  for (const [day, models] of Object.entries(load())) {
    const month = day.slice(0, 7);
    if (month < first || day > today) continue;
    const perModel = byMonth.get(month) ?? byMonth.set(month, new Map()).get(month)!;
    for (const [model, counts] of Object.entries(models)) add(perModel.get(model) ?? perModel.set(model, empty()).get(model)!, counts);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, perModel]) => {
      const models = [...perModel.entries()].map(([model, counts]) => ({ model, ...counts })).sort((a, b) => b.requests - a.requests || a.model.localeCompare(b.model));
      const sum = empty();
      for (const counts of models) add(sum, counts);
      return { month, ...sum, models };
    })
    .filter((m) => m.requests > 0);
}

/** Sent and answered tokens from Gemini's `usageMetadata`; a reply without it counts none. */
export function tokensUsed(usage: { promptTokenCount?: number; totalTokenCount?: number } | undefined): { sent: number; answered: number } {
  const sent = usage?.promptTokenCount ?? 0;
  return { sent, answered: Math.max(0, (usage?.totalTokenCount ?? sent) - sent) };
}

// The words Settings shows.
const number = (n: number) => Math.round(n).toLocaleString('en-IN');
const count = (n: number, one: string) => `${number(n)} ${one}${n === 1 ? '' : 's'}`;

/** "12 requests · 48,300 tokens". */
export const usageSummary = (u: UsageCounts) => `${count(u.requests, 'request')} · ${count(u.sent + u.answered, 'token')}`;

/** "Today", or "15 Oct". */
export const usageDayLabel = (day: string, now = new Date()) => (day === istDay(now) ? 'Today' : `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`);

/** "15 Oct · 12 requests · 48,300 tokens (40,100 sent, 8,200 in answers)". Failed requests are shown beside it. */
export const usageDayText = (d: UsageDay, now = new Date()) => `${usageDayLabel(d.day, now)} · ${usageSummary(d)} (${number(d.sent)} sent, ${number(d.answered)} in answers)`;

/** "Oct 2026". */
export const usageMonthLabel = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

/** "Oct 2026 · 210 requests · 8,40,000 tokens". */
export const usageMonthText = (m: UsageMonth) => `${usageMonthLabel(m.month)} · ${usageSummary(m)}`;
