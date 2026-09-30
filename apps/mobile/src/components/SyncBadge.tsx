import { AlertTriangle, CheckCircle2, CloudOff, Loader2, UserRound } from 'lucide-react';
import { useAppState } from '../state/AppState.tsx';

/** Compact connection / backup status; tapping it opens the account sheet. */
export function SyncBadge({ onClick }: { onClick(): void }) {
  const { sync, session, snapshot } = useAppState();
  const pending = snapshot.unsynced + snapshot.jobs.length;

  let icon = <CheckCircle2 size={12} className="text-green-500" />;
  let label = 'Synced';
  if (!session) {
    icon = <UserRound size={12} className="text-gray-400" />;
    label = 'Sign in';
  } else if (!sync.online) {
    icon = <CloudOff size={12} className="text-gray-400" />;
    label = pending ? `Offline · ${pending}` : 'Offline';
  } else if (sync.syncing) {
    icon = <Loader2 size={12} className="animate-spin text-orange-500" />;
    label = 'Syncing';
  } else if (sync.lastError) {
    icon = <AlertTriangle size={12} className="text-red-500" />;
    label = 'Sync issue';
  } else if (pending) {
    icon = <Loader2 size={12} className="text-orange-500" />;
    label = `${pending} pending`;
  }

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-[var(--color-brand-concrete)] rounded-full text-[9px] md:text-[10px] uppercase font-mono tracking-widest text-gray-500 shadow-sm whitespace-nowrap"
      aria-label={`Account and sync: ${label}`}
    >
      {icon} {label}
    </button>
  );
}
