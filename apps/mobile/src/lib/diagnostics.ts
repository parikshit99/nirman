import { APP_VERSION } from './version.ts';

/**
 * A small diagnostic log kept on the phone: errors, AI readings, the steps
 * people take and slow screens. It never records what was bought, prices,
 * addresses, names or the API key; only what happened, where, and how long
 * it took. It leaves the phone only when the user sends it (Settings → Report
 * a problem), or as a crash report if automatic reporting is on.
 */
export type LogKind = 'error' | 'ai' | 'step' | 'perf';

export interface LogEntry {
  /** ISO time. */
  t: string;
  kind: LogKind;
  /** Short description, e.g. "saveDraftToHistory" or "TypeError: x is undefined". */
  msg: string;
  /** Numbers and short labels only. */
  data?: Record<string, string | number | boolean>;
}

const KEY = 'nirmaan_diagnostics';
const MAX_ENTRIES = 400;
const MAX_TEXT = 300;

let entries: LogEntry[] | null = null;
const listeners = new Set<(entry: LogEntry) => void>();

function load(): LogEntry[] {
  if (entries) return entries;
  try {
    entries = JSON.parse(localStorage.getItem(KEY) ?? '[]') as LogEntry[];
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
      localStorage.setItem(KEY, JSON.stringify(load()));
    } catch {
      // Storage full or unavailable: the log is best effort.
    }
  }, 500);
}

/** Strip anything that looks like an API key, and cap the length. */
export function scrub(text: string): string {
  return text.replace(/AIza[0-9A-Za-z_-]{20,}/g, 'AIza…').replace(/key=[^&\s]+/gi, 'key=…').slice(0, MAX_TEXT);
}

export function log(kind: LogKind, msg: string, data?: LogEntry['data']) {
  const entry: LogEntry = { t: new Date().toISOString(), kind, msg: scrub(msg), ...(data ? { data } : {}) };
  const list = load();
  list.push(entry);
  if (list.length > MAX_ENTRIES) list.splice(0, list.length - MAX_ENTRIES);
  save();
  listeners.forEach((fn) => fn(entry));
}

export const logStep = (name: string, data?: LogEntry['data']) => log('step', name, data);
export const logPerf = (name: string, ms: number, data?: LogEntry['data']) => log('perf', name, { ms: Math.round(ms), ...data });
export function logError(err: unknown, where: string) {
  const e = err instanceof Error ? err : new Error(String(err));
  const at = e.stack?.split('\n').slice(1, 3).map((l) => l.trim()).join(' < ') ?? '';
  log('error', `${e.name}: ${e.message}`, { where, ...(at ? { at: scrub(at) } : {}) });
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
export const onLogEntry = (fn: (entry: LogEntry) => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Catch errors nothing else handled. */
export function installErrorHandlers() {
  window.addEventListener('error', (e) => logError(e.error ?? e.message, 'window'));
  window.addEventListener('unhandledrejection', (e) => logError(e.reason, 'promise'));
}

export function deviceSummary(): Record<string, string> {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const android = /Android ([\d.]+)/.exec(ua)?.[1];
  const model = /Android [\d.]+; ([^;)]+)/.exec(ua)?.[1]?.replace(/ Build.*/, '');
  const chrome = /Chrome\/([\d.]+)/.exec(ua)?.[1];
  return {
    app: APP_VERSION,
    android: android ?? 'n/a',
    phone: model ?? 'n/a',
    webview: chrome ?? 'n/a',
    screen: typeof window !== 'undefined' ? `${window.screen.width}×${window.screen.height}` : 'n/a',
  };
}

const line = (e: LogEntry) =>
  `${e.t.slice(5, 19).replace('T', ' ')} ${e.kind.padEnd(5)} ${e.msg}${e.data ? ` ${Object.entries(e.data).map(([k, v]) => `${k}=${v}`).join(' ')}` : ''}`;

/** Plain-text log for sharing: device details, then every entry (times in UTC). */
export function logAsText(): string {
  const d = deviceSummary();
  return [
    `Nirman diagnostics — ${new Date().toISOString()}`,
    ...Object.entries(d).map(([k, v]) => `${k}: ${v}`),
    '',
    ...load().map(line),
  ].join('\n');
}

/** A GitHub issue pre-filled with the device, recent errors and the last steps; fits in a URL. */
export function issueUrl(repo: string, note = ''): string {
  const d = deviceSummary();
  const all = load();
  const errors = all.filter((e) => e.kind === 'error').slice(-8);
  const ai = all.filter((e) => e.kind === 'ai').slice(-5);
  const recent = all.filter((e) => e.kind === 'step' || e.kind === 'perf').slice(-15);
  const block = (title: string, list: LogEntry[]) => (list.length ? `\n### ${title}\n\`\`\`\n${list.map(line).join('\n')}\n\`\`\`\n` : '');
  let body = [
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
    '_Sent from Nirman → Settings → Report a problem. No bill contents, prices, addresses or keys are included._',
  ].join('\n');
  // GitHub rejects very long URLs; keep the newest part of the log.
  while (encodeURIComponent(body).length > 6500 && body.includes('\n')) body = body.replace(/```\n[^\n]*\n/, '```\n');
  return `https://github.com/${repo}/issues/new?labels=bug&title=${encodeURIComponent(`Problem report (${d.app})`)}&body=${encodeURIComponent(body)}`;
}
