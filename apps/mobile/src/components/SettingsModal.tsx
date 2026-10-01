import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Download, Eye, EyeOff, KeyRound, Loader2, Settings as SettingsIcon, Upload, X } from 'lucide-react';
import { backupFilename, BackupError } from '../data/backup.ts';
import { shareFile, textToBase64 } from '../lib/files.ts';
import { testGeminiKey } from '../lib/gemini.ts';
import { DEFAULT_MODEL } from '../lib/settings.ts';
import { useAppState } from '../state/AppState.tsx';
import { useDialogs } from './Dialogs.tsx';

/**
 * API key, backup and storage info. On first launch it doubles as a short
 * welcome that asks for the key (skippable: typing items in works without one).
 */
export function SettingsModal({ onClose, firstRun }: { onClose(): void; firstRun?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex justify-between items-center">
          <h3 id="settings-title" className="font-bold text-gray-900 uppercase tracking-widest text-sm flex items-center gap-2">
            <SettingsIcon size={18} className="text-orange-500" /> {firstRun ? 'Welcome' : 'Settings'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-black" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        {firstRun && (
          <p className="text-[11px] text-gray-500 leading-relaxed">
            Everything you record is stored only on this phone and works offline. To read bills, notes and voice with AI, add your own
            Google Gemini API key below. You can skip this and add it later from Settings.
          </p>
        )}
        <ApiKeySection onSaved={firstRun ? onClose : undefined} />
        {firstRun ? (
          <button onClick={onClose} className="w-full py-3 bg-white border border-gray-200 text-gray-600 font-bold rounded-xl uppercase tracking-widest text-[10px]">
            Skip for now
          </button>
        ) : (
          <>
            <BackupSection />
            <StorageSection />
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-[10px] font-mono uppercase tracking-widest text-gray-400 font-bold">{children}</h4>;
}

function ApiKeySection({ onSaved }: { onSaved?(): void }) {
  const { settings, actions } = useAppState();
  const [key, setKey] = useState(settings.geminiApiKey);
  const [model, setModel] = useState(settings.geminiModel);
  const [show, setShow] = useState(false);
  const [state, setState] = useState<{ kind: 'idle' | 'testing' | 'ok' | 'error'; message?: string }>({ kind: 'idle' });
  const dirty = key.trim() !== settings.geminiApiKey || (model.trim() || DEFAULT_MODEL) !== settings.geminiModel;

  const save = async () => {
    await actions.saveSettings({ geminiApiKey: key.trim(), geminiModel: model.trim() || DEFAULT_MODEL });
    setState({ kind: 'ok', message: 'Saved' });
    onSaved?.();
  };

  const test = async () => {
    setState({ kind: 'testing' });
    try {
      await testGeminiKey(key.trim(), model.trim() || DEFAULT_MODEL);
      setState({ kind: 'ok', message: 'Key works' });
    } catch (err) {
      setState({ kind: 'error', message: (err as Error).message });
    }
  };

  return (
    <section className="space-y-3">
      <SectionTitle>AI reading (Gemini)</SectionTitle>
      <div>
        <label htmlFor="api-key" className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5 mb-1">
          <KeyRound size={12} /> API key
        </label>
        <div className="relative">
          <input
            id="api-key"
            type={show ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setState({ kind: 'idle' });
            }}
            placeholder="AIza…"
            className="w-full pl-4 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm font-mono"
          />
          <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-3 text-gray-400" aria-label={show ? 'Hide key' : 'Show key'}>
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">
          Get a free key at aistudio.google.com → “Get API key”. It is stored encrypted on this phone only.
        </p>
      </div>
      <details className="text-[11px]">
        <summary className="text-gray-400 cursor-pointer">Advanced</summary>
        <label htmlFor="api-model" className="block font-bold text-gray-700 mt-2 mb-1">
          Model
        </label>
        <input
          id="api-model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={DEFAULT_MODEL}
          className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none text-xs font-mono"
        />
      </details>
      {state.kind === 'error' && <p className="text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">{state.message}</p>}
      {state.kind === 'ok' && (
        <p className="text-[11px] text-green-700 flex items-center gap-1">
          <CheckCircle2 size={12} /> {state.message}
        </p>
      )}
      <div className="flex gap-3">
        <button
          onClick={test}
          disabled={!key.trim() || state.kind === 'testing'}
          className="flex-1 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {state.kind === 'testing' && <Loader2 size={12} className="animate-spin" />} Test key
        </button>
        <button
          onClick={save}
          disabled={!dirty}
          className="flex-1 py-3 bg-[var(--color-brand-primary)] text-white font-bold rounded-xl uppercase tracking-widest text-[10px] disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </section>
  );
}

function BackupSection() {
  const { actions } = useAppState();
  const dialogs = useDialogs();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const doExport = async () => {
    setBusy(true);
    try {
      const backup = await actions.exportBackup();
      await shareFile(backupFilename(), textToBase64(JSON.stringify(backup)), 'application/json');
    } catch (err) {
      await dialogs.alert('Backup failed', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doImport = async (file: File) => {
    try {
      const backup = actions.parseBackup(await file.text());
      const when = new Date(backup.exported_at).toLocaleString('en-IN');
      const saved = backup.lists.filter((l) => l.status === 'saved').length;
      const ok = await dialogs.confirm('Replace all data on this phone?', {
        message: `Restore the backup from ${when} (${saved} saved sessions, ${backup.items.length} items).\nEverything currently on this phone, including queued entries, will be replaced.`,
        confirmLabel: 'Restore',
        danger: true,
      });
      if (!ok) return;
      setBusy(true);
      await actions.restoreBackup(backup);
      await dialogs.alert('Backup restored');
    } catch (err) {
      await dialogs.alert('Could not restore', err instanceof BackupError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3">
      <SectionTitle>Backup</SectionTitle>
      <p className="text-[11px] text-gray-500 leading-relaxed">
        Your data lives only on this phone. Save a backup file to Google Drive, WhatsApp or email now and then, so you can restore it on a new phone.
      </p>
      <div className="flex gap-3">
        <button
          onClick={doExport}
          disabled={busy}
          className="flex-1 py-3 bg-black text-white font-bold rounded-xl uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Download size={14} /> Save backup
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="flex-1 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Upload size={14} /> Restore
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-label="Backup file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void doImport(file);
        }}
      />
    </section>
  );
}

function StorageSection() {
  const { history, snapshot } = useAppState();
  return (
    <section className="space-y-2">
      <SectionTitle>On this phone</SectionTitle>
      <dl className="grid grid-cols-2 gap-2 text-[11px]">
        <dt className="text-gray-500">Saved sessions</dt>
        <dd className="font-bold text-right">{history.length}</dd>
        <dt className="text-gray-500">Items</dt>
        <dd className="font-bold text-right">{snapshot.items.length}</dd>
        <dt className="text-gray-500">Indexed rates</dt>
        <dd className="font-bold text-right">{snapshot.rates.length}</dd>
        <dt className="text-gray-500">Queued AI entries</dt>
        <dd className="font-bold text-right">{snapshot.jobs.length}</dd>
      </dl>
    </section>
  );
}
