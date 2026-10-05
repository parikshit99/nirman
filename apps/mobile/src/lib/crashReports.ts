import { getLog, onLogEntry, scrub } from './diagnostics.ts';
import { prefs } from './prefs.ts';
import { APP_VERSION } from './version.ts';

const PREF = 'nirmaan_crash_reports';

/** Set at build time from the SENTRY_DSN repository variable; blank means crash reporting is off. */
const DSN = (import.meta.env.VITE_SENTRY_DSN as string | undefined) ?? '';

export const crashReportsAvailable = () => !!DSN;
export const crashReportsEnabled = () => !!DSN && prefs.get(PREF, true);
export const setCrashReportsEnabled = (on: boolean) => prefs.set(PREF, on);

/**
 * Automatic crash reports: errors only, with the app version, phone details
 * and the last steps from the diagnostic log (with what they worked on). Breadcrumbs that could carry
 * typed text or request URLs are dropped, and nothing is sent while the
 * switch in Settings is off.
 */
export async function startCrashReports() {
  if (!crashReportsEnabled()) return;
  const Sentry = await import('@sentry/browser');
  Sentry.init({
    dsn: DSN,
    release: `nirman@${APP_VERSION}`,
    environment: import.meta.env.DEV ? 'development' : 'production',
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeBreadcrumb: (crumb) => (crumb.category === 'console' || crumb.category === 'xhr' || crumb.category === 'fetch' || crumb.category === 'ui.input' ? null : crumb),
    beforeSend(event) {
      if (!crashReportsEnabled()) return null;
      if (event.request) delete event.request.url;
      for (const ex of event.exception?.values ?? []) if (ex.value) ex.value = scrub(ex.value);
      event.extra = { ...event.extra, steps: getLog().filter((e) => e.kind !== 'error').slice(-20).map((e) => `${e.t} ${e.kind} ${e.msg}${e.detail ? ` ${e.detail}` : ''}`) };
      return event;
    },
  });
  // Errors the app caught and logged itself (not seen by Sentry's global handlers).
  onLogEntry((entry) => {
    if (entry.kind !== 'error' || entry.data?.where === 'window' || entry.data?.where === 'promise') return;
    Sentry.captureMessage(entry.msg, { level: 'error', tags: { where: String(entry.data?.where ?? '') } });
  });
}
