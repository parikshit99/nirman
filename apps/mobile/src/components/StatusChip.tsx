import { NO_KEY_MESSAGE } from '../jobs/worker.ts';
import { AlertTriangle, CheckCircle2, CloudOff, KeyRound, Loader2, Settings } from 'lucide-react';
import { useAppState } from '../state/AppState.tsx';

/** Connection and AI-queue status, with a Settings button beside it; both open Settings. */
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
  } else if (queued && !settings.geminiApiKey && status.lastError === NO_KEY_MESSAGE) {
    icon = <KeyRound size={12} className="text-orange-500" />;
    label = 'Add API key';
  } else if (status.lastError) {
    icon = <AlertTriangle size={12} className="text-red-500" />;
    label = queued ? `${queued} queued` : 'AI issue';
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={onClick}
        title={status.lastError ?? undefined}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-[var(--color-brand-concrete)] rounded-full text-[11px] md:text-[11px] uppercase font-mono tracking-widest text-gray-500 shadow-sm whitespace-nowrap"
        aria-label={`Status: ${label}`}
      >
        {icon} {label}
      </button>
      <button
        onClick={onClick}
        className="p-2 bg-white border border-[var(--color-brand-concrete)] rounded-full text-gray-600 shadow-sm hover:text-[var(--color-brand-dark)]"
        aria-label="Settings"
        title="Settings"
      >
        <Settings size={16} />
      </button>
    </div>
  );
}
