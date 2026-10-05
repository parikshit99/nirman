import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Download, Eye, EyeOff, KeyRound, Loader2, Settings as SettingsIcon, Upload, X } from 'lucide-react';
import { backupFilename, BackupError } from '../data/backup.ts';
import { shareFile, textToBase64 } from '../lib/files.ts';
import { testGeminiKey } from '../lib/gemini.ts';
import { DEFAULT_MODEL } from '../lib/settings.ts';
import { APP_VERSION } from '../lib/version.ts';
import { latestNotes } from '../lib/whatsNew.ts';
import { loadConversions, resetConversions, saveConversions } from '../lib/conversionSettings.ts';
import { parseSize, sizeLabel, type SheetSize } from '@nirman/shared';
import { describeLastBackup, recordBackup } from '../lib/backupReminder.ts';
import { useAppState } from '../state/AppState.tsx';
import { useDialogs } from './Dialogs.tsx';
import { useBackHandler } from '../lib/backButton.ts';

/**
 * API key, backup and storage info. On first launch it doubles as a short
 * welcome that asks for the key (skippable: typing items in works without one).
 */
export function SettingsModal({ onClose, firstRun, onWhatsNew }: { onClose(): void; firstRun?: boolean; onWhatsNew?(): void }) {
  useBackHandler(onClose);
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
          <button onClick={onClose} className="w-full py-3 bg-white border border-gray-200 text-gray-600 font-bold rounded-xl uppercase tracking-widest text-[11px]">
            Skip for now
          </button>
        ) : (
          <>
            <BackupSection />
            <ConversionsSection />
            <StorageSection onWhatsNew={onWhatsNew} />
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-[11px] font-mono uppercase tracking-widest text-gray-400 font-bold">{children}</h4>;
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
      const requested = model.trim() || DEFAULT_MODEL;
      const working = await testGeminiKey(key.trim(), requested);
      if (working !== requested) {
        setModel(working);
        setState({ kind: 'ok', message: `Key works. Model “${requested}” is no longer available, so “${working}” will be used. Tap Save.` });
      } else {
        setState({ kind: 'ok', message: 'Key works' });
      }
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
        <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
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
          className="flex-1 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {state.kind === 'testing' && <Loader2 size={12} className="animate-spin" />} Test key
        </button>
        <button
          onClick={save}
          disabled={!dirty}
          className="flex-1 py-3 bg-[var(--color-brand-primary)] text-white font-bold rounded-xl uppercase tracking-widest text-[11px] disabled:opacity-50"
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
  const [lastBackup, setLastBackup] = useState(describeLastBackup);

  const doExport = async () => {
    setBusy(true);
    try {
      const backup = await actions.exportBackup();
      await shareFile(backupFilename(), textToBase64(JSON.stringify(backup)), 'application/json');
      recordBackup();
      setLastBackup(describeLastBackup());
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
      <p className={`text-[11px] font-bold ${lastBackup === 'never' ? 'text-red-600' : 'text-gray-700'}`}>Last backup: {lastBackup}</p>
      <div className="flex gap-3">
        <button
          onClick={doExport}
          disabled={busy}
          className="flex-1 py-3 bg-black text-white font-bold rounded-xl uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Download size={14} /> Save backup
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="flex-1 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 disabled:opacity-50"
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

function StorageSection({ onWhatsNew }: { onWhatsNew?(): void }) {
  const { history, snapshot, learningCount, hiddenMaterials, actions } = useAppState();
  const dialogs = useDialogs();
  const [showLearned, setShowLearned] = useState(false);
  const resetLearning = async () => {
    const ok = await dialogs.confirm(`Forget ${learningCount} learned corrections?`, {
      message: 'The AI will go back to its default reading of these terms.',
      confirmLabel: 'Forget',
      danger: true,
    });
    if (ok) await actions.clearLearning();
  };
  return (
    <section className="space-y-2">
      <SectionTitle>On this phone</SectionTitle>
      <dl className="grid grid-cols-2 gap-2 text-[11px]">
        <dt className="text-gray-500">Saved sessions</dt>
        <dd className="font-bold text-right">{history.length}</dd>
        <dt className="text-gray-500">Items</dt>
        <dd className="font-bold text-right">{snapshot.items.length}</dd>
        <dt className="text-gray-500">Added rates</dt>
        <dd className="font-bold text-right">{snapshot.rates.length}</dd>
        <dt className="text-gray-500">Queued AI entries</dt>
        <dd className="font-bold text-right">{snapshot.jobs.length}</dd>
        <dt className="text-gray-500">Learned corrections</dt>
        <dd className="font-bold text-right">
          {learningCount}
          {learningCount > 0 && (
            <button onClick={() => setShowLearned((v) => !v)} className="ml-2 text-blue-600 font-bold underline" aria-expanded={showLearned}>
              {showLearned ? 'Hide' : 'Manage'}
            </button>
          )}
        </dd>
        <dt className="text-gray-500">App version</dt>
        <dd className="font-bold text-right font-mono">
          {APP_VERSION}
          {onWhatsNew && latestNotes && (
            <button onClick={onWhatsNew} className="ml-2 text-blue-600 font-bold underline font-sans">
              What's new
            </button>
          )}
        </dd>
      </dl>
      {showLearned && learningCount > 0 && <LearnedCorrections onForgetAll={resetLearning} />}
      {hiddenMaterials.length > 0 && (
        <div className="pt-2">
          <div className="flex justify-between items-center text-[11px] text-gray-500 mb-1">
            <span>Deleted from Data ({hiddenMaterials.length})</span>
            {hiddenMaterials.length > 1 && (
              <button onClick={async () => { for (const m of hiddenMaterials) await actions.unhideMaterial(m.id); }} className="text-blue-600 font-bold underline" aria-label="Restore all deleted materials to Data">
                Restore all
              </button>
            )}
          </div>
          <ul className="space-y-1">
            {hiddenMaterials.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 text-xs bg-gray-50 rounded-lg px-3 py-1.5">
                <span className="truncate">
                  {m.name} <span className="text-gray-500">· per {m.unit}</span>
                </span>
                <button onClick={() => actions.unhideMaterial(m.id)} className="text-blue-600 font-bold underline shrink-0" aria-label={`Restore ${m.name} to Data`}>
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Each remembered correction: the word as written or spoken, and the name and unit it is read as. */
function LearnedCorrections({ onForgetAll }: { onForgetAll(): void }) {
  const { snapshot, actions } = useAppState();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ item_name: '', unit: '' });
  const q = query.trim().toLowerCase();
  const terms = [...snapshot.learned]
    .sort((a, b) => a.id.localeCompare(b.id))
    .filter((t) => !q || t.id.includes(q) || t.item_name.toLowerCase().includes(q));
  const field = 'w-full min-w-0 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-blue-400';

  return (
    <div className="pt-2 space-y-2">
      <p className="text-[11px] text-gray-500 leading-snug">
        Words the app has learned to read your way, from your edits. Change what a word is read as, or delete it so the AI reads it fresh.
      </p>
      {snapshot.learned.length > 6 && (
        <input aria-label="Search learned corrections" className={field} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search words or names" />
      )}
      <ul className="space-y-1 max-h-72 overflow-y-auto">
        {terms.map((t) =>
          editing === t.id ? (
            <li key={t.id} className="text-xs bg-blue-50 rounded-lg p-2 space-y-1.5">
              <div className="font-mono text-gray-600">“{t.id}” is read as</div>
              <div className="grid grid-cols-[1fr_5rem] gap-1.5">
                <input aria-label="Read as name" className={field} value={draft.item_name} onChange={(e) => setDraft((d) => ({ ...d, item_name: e.target.value }))} />
                <input aria-label="Read as unit" className={field} value={draft.unit} onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))} />
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setEditing(null)} className="text-gray-500 font-bold">
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    await actions.updateLearnedTerm(t.id, draft);
                    setEditing(null);
                  }}
                  disabled={!draft.item_name.trim()}
                  className="text-blue-600 font-bold underline disabled:opacity-40"
                  aria-label={`Save correction for ${t.id}`}
                >
                  Save
                </button>
              </div>
            </li>
          ) : (
            <li key={t.id} className="flex items-center justify-between gap-2 text-xs bg-gray-50 rounded-lg px-3 py-1.5">
              <span className="min-w-0 break-words">
                <span className="font-mono text-gray-600">{t.id}</span> → <b>{t.item_name}</b> <span className="text-gray-500">· {t.unit}</span>
              </span>
              <span className="flex gap-3 shrink-0">
                <button
                  onClick={() => {
                    setEditing(t.id);
                    setDraft({ item_name: t.item_name, unit: t.unit });
                  }}
                  className="text-blue-600 font-bold underline"
                  aria-label={`Edit correction for ${t.id}`}
                >
                  Edit
                </button>
                <button onClick={() => actions.deleteLearnedTerm(t.id)} className="text-red-600 font-bold underline" aria-label={`Delete correction for ${t.id}`}>
                  Delete
                </button>
              </span>
            </li>
          ),
        )}
        {terms.length === 0 && <li className="text-xs text-gray-500 px-1">No match.</li>}
      </ul>
      <button onClick={onForgetAll} className="text-[11px] text-red-600 font-bold underline">
        Forget all learned corrections
      </button>
    </div>
  );
}

const sizesText = (sizes: SheetSize[]) => sizes.map((z) => `${z.width}x${z.length}`).join(', ');
const parseSizes = (text: string) => text.split(/[,;\n]+/).map((t) => parseSize(t)).filter((z): z is SheetSize => !!z);

/** Bars per bundle, bar length and the tile / ACP sizes offered by the unit calculator. */
function ConversionsSection() {
  const [open, setOpen] = useState(false);
  const [initial] = useState(loadConversions);
  const [bars, setBars] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(initial.bundleBars).map(([d, n]) => [d, String(n)])));
  const [length, setLength] = useState(String(initial.barLength));
  const [tiles, setTiles] = useState(sizesText(initial.tileSizes));
  const [acp, setAcp] = useState(sizesText(initial.acpSizes));
  const [saved, setSaved] = useState(false);
  const field = 'w-full min-w-0 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-blue-400';

  const save = () => {
    const bundleBars = Object.fromEntries(Object.entries(bars).map(([d, n]) => [d, Math.max(0, Math.round(Number(n) || 0))]));
    const tileSizes = parseSizes(tiles);
    const acpSizes = parseSizes(acp);
    saveConversions({ bundleBars, barLength: Number(length) > 0 ? Number(length) : 12, tileSizes, acpSizes });
    setTiles(sizesText(loadConversions().tileSizes));
    setAcp(sizesText(loadConversions().acpSizes));
    setSaved(true);
  };

  return (
    <section className="space-y-2">
      <SectionTitle>TMT, tiles and ACP</SectionTitle>
      <p className="text-[11px] text-gray-500 leading-relaxed">
        Used to turn TMT bundles into kg and sqft into whole tiles or sheets.{' '}
        <button onClick={() => setOpen((v) => !v)} className="text-blue-600 font-bold underline" aria-expanded={open}>
          {open ? 'Hide' : 'Edit'}
        </button>
      </p>
      {open && (
        <div className="space-y-3 text-xs">
          <div>
            <span className="font-bold text-gray-500">Bars per bundle</span>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {Object.keys(bars)
                .sort((a, b) => Number(a) - Number(b))
                .map((d) => (
                  <label key={d} className="flex items-center gap-1">
                    <span className="w-12 shrink-0 font-mono">{d} mm</span>
                    <input aria-label={`Bars per bundle for ${d} mm`} inputMode="numeric" className={field} value={bars[d]} onChange={(e) => { setBars((b) => ({ ...b, [d]: e.target.value })); setSaved(false); }} />
                  </label>
                ))}
            </div>
          </div>
          <label className="block">
            <span className="font-bold text-gray-500">Standard bar length (m)</span>
            <input aria-label="Standard bar length" inputMode="decimal" className={field} value={length} onChange={(e) => { setLength(e.target.value); setSaved(false); }} />
          </label>
          <label className="block">
            <span className="font-bold text-gray-500">Tile sizes (mm)</span>
            <input aria-label="Tile sizes" className={field} value={tiles} onChange={(e) => { setTiles(e.target.value); setSaved(false); }} />
          </label>
          <label className="block">
            <span className="font-bold text-gray-500">ACP sheet sizes (mm)</span>
            <input aria-label="ACP sheet sizes" className={field} value={acp} onChange={(e) => { setAcp(e.target.value); setSaved(false); }} />
          </label>
          <p className="text-[11px] text-gray-500">Sizes are width x length, separated by commas, e.g. {sizeLabel({ width: 600, length: 1200 }).replace(' mm', '')}, 800x1600.</p>
          <div className="flex gap-3 items-center">
            <button onClick={save} className="px-4 py-2 bg-gray-900 text-white rounded-lg font-bold">
              Save
            </button>
            <button
              onClick={() => {
                resetConversions();
                const d = loadConversions();
                setBars(Object.fromEntries(Object.entries(d.bundleBars).map(([k, n]) => [k, String(n)])));
                setLength(String(d.barLength));
                setTiles(sizesText(d.tileSizes));
                setAcp(sizesText(d.acpSizes));
                setSaved(true);
              }}
              className="text-blue-600 font-bold underline"
            >
              Reset to defaults
            </button>
            {saved && <span role="status" className="text-green-700 font-bold">Saved</span>}
          </div>
        </div>
      )}
    </section>
  );
}
