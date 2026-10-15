import { platform } from '../platform.ts';

/**
 * A diagnostic log kept on the phone: errors, AI readings, the steps people
 * take and slow screens, with what each step was given (item names, rates,
 * vendors, addresses, AI input and output) so a problem can be reproduced.
 * Photos are left out and the API key is always removed.
 * Settings → Report a problem opens an issue on the PUBLIC GitHub repo, so it
 * carries only the phone details, error messages and the names and `data` of
 * recent entries, never `detail`. The full log leaves the phone only with Share log.
 */
export type LogKind = 'error' | 'ai' | 'step' | 'perf';

export interface LogEntry {
  /** ISO time. */
  t: string;
  kind: LogKind;
  /** Short description, e.g. "saveDraftToHistory" or "TypeError: x is undefined". */
  msg: string;
  /** Numbers and short labels only, never text a user typed or a bill held: it goes into public problem reports. */
  data?: Record<string, string | number | boolean>;
  /** What the step worked on, e.g. the arguments of an action or the AI's reading. Only in Share log, never in a problem report. */
  detail?: string;
}

const KEY = 'nirmaan_diagnostics';
const MAX_ENTRIES = 400;
const MAX_TEXT = 300;
const MAX_DETAIL = 800;

let entries: LogEntry[] | null = null;

function load(): LogEntry[] {
  if (entries) return entries;
  try {
    entries = JSON.parse(platform.storage.getItem(KEY) ?? '[]') as LogEntry[];
  } catch {
    entries = [];
  }
  return entries;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      platform.storage.setItem(KEY, JSON.stringify(load()));
    } catch {
      // Storage full or unavailable: the log is best effort.
    }
  }, 500);
}

/** Strip anything that looks like an API key, and cap the length. */
export function scrub(text: string, max = MAX_TEXT): string {
  return text.replace(/AIza[0-9A-Za-z_-]{20,}/g, 'AIza…').replace(/key=[^&\s]+/gi, 'key=…').slice(0, max);
}

/** Values as short JSON for the log: photos and other long encoded data become a size note, keys are removed. */
export function describe(value: unknown): string {
  const seen = new WeakSet<object>();
  const json = JSON.stringify(value, (k, v: unknown) => {
    if (/apikey/i.test(k)) return '…';
    if (typeof v === 'string' && (v.startsWith('data:') || (v.length > 200 && /^[A-Za-z0-9+/=]+$/.test(v)))) return `[data ${Math.round((v.length * 3) / 4096)} kB]`;
    if (typeof v === 'function') return undefined;
    if (v && typeof v === 'object') {
      if (seen.has(v)) return '[…]';
      seen.add(v);
    }
    return v;
  });
  return scrub(json ?? '', MAX_DETAIL);
}

export function log(kind: LogKind, msg: string, data?: LogEntry['data'], detail?: string) {
  const entry: LogEntry = { t: new Date().toISOString(), kind, msg: scrub(msg), ...(data ? { data } : {}), ...(detail ? { detail: scrub(detail, MAX_DETAIL) } : {}) };
  const list = load();
  list.push(entry);
  if (list.length > MAX_ENTRIES) list.splice(0, list.length - MAX_ENTRIES);
  save();
}

export const logStep = (name: string, data?: LogEntry['data'], detail?: string) => log('step', name, data, detail);
export const logPerf = (name: string, ms: number, data?: LogEntry['data']) => log('perf', name, { ms: Math.round(ms), ...data });
export function logError(err: unknown, where: string, detail?: string) {
  const e = err instanceof Error ? err : new Error(String(err));
  const at = e.stack?.split('\n').slice(1, 3).map((l) => l.trim()).join(' < ') ?? '';
  log('error', `${e.name}: ${e.message}`, { where, ...(at ? { at: scrub(at) } : {}) }, detail);
}

/** Time an async step; slow ones (over `slowMs`) are also logged as perf. */
export async function timed<T>(name: string, fn: () => Promise<T>, slowMs = 800): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const ms = performance.now() - start;
    if (ms >= slowMs) logPerf(name, ms);
  }
}

export const getLog = (): readonly LogEntry[] => load();
export function clearLog() {
  entries = [];
  save();
}

/** App version, phone and screen, from the app (`configureCore`). */
export const deviceSummary = (): Record<string, string> => platform.deviceInfo();

/** One entry as text; `withDetail` false leaves out what it worked on (for the public problem report). */
const line = (e: LogEntry, withDetail = true) =>
  `${e.t.slice(5, 19).replace('T', ' ')} ${e.kind.padEnd(5)} ${e.msg}${e.data ? ` ${Object.entries(e.data).map(([k, v]) => `${k}=${v}`).join(' ')}` : ''}${withDetail && e.detail ? `\n    ${e.detail}` : ''}`;

/** Plain-text log for sharing: device details, then every entry (times in UTC). */
export function logAsText(): string {
  const d = deviceSummary();
  return [
    `Nirman diagnostics — ${new Date().toISOString()}`,
    ...Object.entries(d).map(([k, v]) => `${k}: ${v}`),
    '',
    ...load().map((e) => line(e)),
  ].join('\n');
}

/**
 * A GitHub issue pre-filled with the device, recent errors and the last steps; fits in a URL. The repo is public, so
 * entries go in without their `detail` (items, rates, vendors, addresses): names, data and error messages only.
 */
export function issueUrl(repo: string, note = ''): string {
  const d = deviceSummary();
  const all = load();
  const errors = all.filter((e) => e.kind === 'error').slice(-8);
  const ai = all.filter((e) => e.kind === 'ai').slice(-5);
  const recent = all.filter((e) => e.kind === 'step' || e.kind === 'perf').slice(-15);
  const block = (title: string, list: LogEntry[]) => (list.length ? `\n### ${title}\n\`\`\`\n${list.map((e) => line(e, false)).join('\n')}\n\`\`\`\n` : '');
  const build = () =>
    [
      '### What happened?',
      note || '<!-- Describe what you did and what went wrong. Add a screenshot if you can. -->',
      '',
      '### Phone',
      Object.entries(d)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join('\n'),
      block('Recent errors', errors),
      block('Recent AI readings', ai),
      block('Last steps (UTC)', recent),
      '_Sent from Nirman → Settings → Report a problem. This issue is public: it has the phone details, errors and the names of recent steps, but no items, rates, vendors or addresses, and never photos or the API key. The full log stays on the phone and is sent only with Settings → Share log._',
    ].join('\n');
  // GitHub rejects very long URLs; drop the oldest entries, steps first, until it fits.
  let body = build();
  while (encodeURIComponent(body).length > 6500) {
    const list = [recent, ai, errors].find((l) => l.length > 1) ?? [recent, ai, errors].find((l) => l.length);
    if (!list) break;
    list.shift();
    body = build();
  }
  return `https://github.com/${repo}/issues/new?labels=bug&title=${encodeURIComponent(`Problem report (${d.app})`)}&body=${encodeURIComponent(body)}`;
}
