import { AlertTriangle, CheckCircle2, CloudOff, KeyRound, Loader2 } from 'lucide-react';
import { useAppState } from '../state/AppState.tsx';

/** Connection and AI-queue status; tapping it opens Settings. */
export function StatusChip({ onClick }: { onClick(): void }) {
  const { status, settings, snapshot } = useAppState();
  const queued = snapshot.jobs.filter((j) => j.status !== 'failed').length;

  let icon = <CheckCircle2 size={12} className="text-green-500" />;
  let label = 'Online';
  if (!status.online) {
    icon = <CloudOff size={12} className="text-gray-400" />;
    label = queued ? `Offline · ${queued} queued` : 'Offline';
  } else if (status.processing) {
    icon = <Loader2 size={12} className="animate-spin text-orange-500" />;
    label = 'Reading…';
  } else if (queued && !settings.geminiApiKey) {
    icon = <KeyRound size={12} className="text-orange-500" />;
    label = 'Add API key';
  } else if (status.lastError) {
    icon = <AlertTriangle size={12} className="text-red-500" />;
    label = queued ? `${queued} queued` : 'AI issue';
  }

  return (
    <button
      onClick={onClick}
      title={status.lastError ?? undefined}
      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-[var(--color-brand-concrete)] rounded-full text-[9px] md:text-[10px] uppercase font-mono tracking-widest text-gray-500 shadow-sm whitespace-nowrap"
      aria-label={`Settings. Status: ${label}`}
    >
      {icon} {label}
    </button>
  );
}
