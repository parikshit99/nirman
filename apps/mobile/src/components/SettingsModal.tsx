import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, Eye, EyeOff, KeyRound, Loader2, Settings as SettingsIcon, Trash2, Upload } from 'lucide-react';
import { backupFilename, BackupError } from '../data/backup.ts';
import { shareFile, textToBase64 } from '../lib/files.ts';
import { FALLBACK_MODELS, listReadingModels, testGeminiKey, type ModelOption } from '../lib/gemini.ts';
import { DEFAULT_MODEL, type ReadingMode } from '../lib/settings.ts';
import { APP_VERSION } from '../lib/version.ts';
import { latestNotes } from '../lib/whatsNew.ts';
import { clearLog, getLog, issueUrl, logAsText, logStep } from '../lib/diagnostics.ts';
import { isNative } from '../lib/platform.ts';
import { loadConversions, resetConversions, saveConversions } from '../lib/conversionSettings.ts';
import { parseSize, sizeLabel, type SheetSize } from '@nirman/shared';
import { describeLastBackup, recordBackup } from '../lib/backupReminder.ts';
import { useAppState } from '../state/AppState.tsx';
import { useDialogs } from './Dialogs.tsx';
import { Sheet, SheetHeader } from './ui/Sheet.tsx';
import { Tabs } from './ui/Tabs.tsx';
import { setThemeChoice, themeChoice, type ThemeChoice } from '../lib/theme.ts';
import { Button } from './ui/Button.tsx';

/**
 * API key, backup and storage info. On first launch it doubles as a short
 * welcome that asks for the key (skippable: typing items in works without one).
 */
export function SettingsModal({ onClose, firstRun, onWhatsNew }: { onClose(): void; firstRun?: boolean; onWhatsNew?(): void }) {
  return (
    <Sheet kind="dialog" size="sm" labelledBy="settings-title" onClose={onClose} className="p-6 space-y-6">
      <SheetHeader id="settings-title" icon={<SettingsIcon size={18} className="text-orange-500" />} title={firstRun ? 'Welcome' : 'Settings'} onClose={onClose} />
      {firstRun && (
        <p className="text-xs text-gray-500 leading-relaxed">
            Everything you record is stored only on this phone and works offline. Printed bills and typed lists are read on the phone. For
            handwritten bills and vendor quotes, add your own Google Gemini API key below. You can skip this and add it later from Settings.
        </p>
      )}
      <ApiKeySection onSaved={firstRun ? onClose : undefined} />
      {firstRun ? (
        <button onClick={onClose} className="w-full py-3 bg-white border border-gray-200 text-gray-600 font-bold rounded-xl uppercase tracking-wider text-xs">
          Skip for now
        </button>
      ) : (
        <>
          <AppearanceSection />
          <ReadingSection />
          <BackupSection />
          <ConversionsSection />
          <DiagnosticsSection />
          <StorageSection onWhatsNew={onWhatsNew} />
        </>
      )}
    </Sheet>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-xs text-gray-500 font-bold">{children}</h4>;
}

function ApiKeySection({ onSaved }: { onSaved?(): void }) {
  const { settings, actions } = useAppState();
  const [key, setKey] = useState(settings.geminiApiKey);
  const [model, setModel] = useState(settings.geminiModel);
  const [show, setShow] = useState(false);
  const [state, setState] = useState<{ kind: 'idle' | 'testing' | 'ok' | 'error'; message?: string }>({ kind: 'idle' });
  const [models, setModels] = useState<ModelOption[]>(FALLBACK_MODELS);
  const [loadingModels, setLoadingModels] = useState(false);
  const [typing, setTyping] = useState(false);
  // The models this key can use, fetched once a key is entered.
  const savedKey = settings.geminiApiKey;
  const loadModels = async (apiKey: string) => {
    if (!apiKey) return;
    setLoadingModels(true);
    setModels(await listReadingModels(apiKey));
    setLoadingModels(false);
  };
  useEffect(() => {
    void loadModels(savedKey);
  }, [savedKey]);
  const options = models.some((m) => m.id === model) || !model.trim() ? models : [{ id: model, label: model }, ...models];
  const dirty = key.trim() !== settings.geminiApiKey || (model.trim() || DEFAULT_MODEL) !== settings.geminiModel;

  const save = async () => {
    await actions.saveSettings({ ...settings, geminiApiKey: key.trim(), geminiModel: model.trim() || DEFAULT_MODEL });
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
      void loadModels(key.trim());
    } catch (err) {
      setState({ kind: 'error', message: (err as Error).message });
    }
  };

  return (
    <section className="space-y-3">
      <SectionTitle>AI reading (Gemini)</SectionTitle>
      <div>
        <label htmlFor="api-key" className="text-xs font-bold text-gray-700 flex items-center gap-1.5 mb-1">
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
          <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-3 text-gray-500" aria-label={show ? 'Hide key' : 'Show key'}>
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">
          Get a free key at aistudio.google.com → “Get API key”. It is stored encrypted on this phone only.
        </p>
      </div>
      <div className="text-xs">
        <label htmlFor="api-model" className="font-bold text-gray-700 mb-1 flex items-center gap-1.5">
          Model {loadingModels && <Loader2 size={11} className="animate-spin text-gray-500" />}
        </label>
        {typing ? (
          <input
            id="api-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={DEFAULT_MODEL}
            autoFocus
            className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none text-xs font-mono"
          />
        ) : (
          <select
            id="api-model"
            value={model || DEFAULT_MODEL}
            onChange={(e) => (e.target.value === '__other' ? setTyping(true) : setModel(e.target.value))}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none text-xs"
          >
            {options.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label === m.id ? m.id : `${m.label} (${m.id})`}
              </option>
            ))}
            <option value="__other">Other (type a name)…</option>
          </select>
        )}
        <p className="text-gray-500 mt-1 leading-relaxed">
          Flash is fast and cheap (best for bills); Flash-Lite is fastest; Pro is slower but more careful. {savedKey ? 'The list shows the models your key can use.' : 'Save a key to see every model it can use.'}
        </p>
      </div>
      {state.kind === 'error' && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">{state.message}</p>}
      {state.kind === 'ok' && (
        <p className="text-xs text-green-700 flex items-center gap-1">
          <CheckCircle2 size={12} /> {state.message}
        </p>
      )}
      <div className="flex gap-3">
        <button
          onClick={test}
          disabled={!key.trim() || state.kind === 'testing'}
          className="flex-1 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl uppercase tracking-wider text-xs flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {state.kind === 'testing' && <Loader2 size={12} className="animate-spin" />} Test key
        </button>
        <button
          onClick={save}
          disabled={!dirty}
          className="flex-1 py-3 bg-[var(--color-brand-primary)] text-white font-bold rounded-xl uppercase tracking-wider text-xs disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </section>
  );
}

const READING_MODES: { mode: ReadingMode; label: string; about: string }[] = [
  { mode: 'auto', label: 'Phone first (recommended)', about: 'Printed bills and typed lists are read on the phone, offline and instantly; Gemini only when the phone is unsure.' },
  { mode: 'phone', label: 'Phone only', about: 'Never sends anything to Gemini. Handwritten bills may need fixing by hand.' },
  { mode: 'gemini', label: 'Gemini always', about: 'Best for handwritten bills; needs internet and an API key.' },
];

function AppearanceSection() {
  const [choice, setChoice] = useState<ThemeChoice>(themeChoice);
  return (
    <section className="space-y-2">
      <SectionTitle>Appearance</SectionTitle>
      <Tabs<ThemeChoice>
        label="Appearance"
        value={choice}
        onChange={(c) => {
          setChoice(c);
          setThemeChoice(c);
        }}
        options={[
          { id: 'system', label: 'Phone' },
          { id: 'light', label: 'Light' },
          { id: 'dark', label: 'Dark' },
        ]}
      />
      <p className="text-xs text-gray-500">Dark is easier on the eyes at night; Phone follows the phone's setting.</p>
    </section>
  );
}

function ReadingSection() {
  const { settings, actions } = useAppState();
  const dialogs = useDialogs();
  const [samples, setSamples] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void actions.countTrainingSamples().then(setSamples);
  }, [actions]);
  const set = (patch: Partial<typeof settings>) => actions.saveSettings({ ...settings, ...patch });

  const exportData = async () => {
    setBusy(true);
    try {
      const { jsonl, count } = await actions.exportTrainingData();
      if (!count) return void (await dialogs.alert('Nothing to export yet', 'Bills are kept as you read them with this switch on.'));
      await shareFile(`nirman-training-${new Date().toISOString().slice(0, 10)}.jsonl`, textToBase64(jsonl), 'application/jsonl');
    } catch (err) {
      await dialogs.alert('Could not export', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const clear = async () => {
    const ok = await dialogs.confirm('Delete the kept bill photos?', { message: `${samples} bills kept for training will be deleted. Your purchase lists are not affected.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    await actions.clearTrainingSamples();
    setSamples(0);
  };

  return (
    <section className="space-y-2">
      <SectionTitle>How bills are read</SectionTitle>
      <div className="space-y-1.5" role="radiogroup" aria-label="How bills are read">
        {READING_MODES.map(({ mode, label, about }) => (
          <label key={mode} className={`flex gap-2 p-2 rounded-xl border cursor-pointer ${settings.readingMode === mode ? 'border-orange-400 bg-orange-50' : 'border-gray-200'}`}>
            <input type="radio" name="reading-mode" className="mt-0.5" checked={settings.readingMode === mode} onChange={() => set({ readingMode: mode })} />
            <span className="text-xs text-gray-600">
              <b className="block text-xs text-gray-800">{label}</b>
              {about}
            </span>
          </label>
        ))}
      </div>
      <label className="flex items-start gap-2 text-xs text-gray-600 pt-1">
        <input type="checkbox" className="mt-0.5" checked={settings.collectTraining} onChange={(e) => set({ collectTraining: e.target.checked })} />
        <span>
          <b className="text-gray-800">Keep bill photos for training.</b> Each photographed bill is kept on this phone with the lines it became (as you correct
          them), to train an AI that runs on the phone later. Not included in backups.
        </span>
      </label>
      {!!samples && (
        <div className="flex items-center gap-2 text-xs">
          <span className="flex-1 text-gray-600">{samples} bills kept</span>
          <button onClick={exportData} disabled={busy} className="px-3 py-1.5 bg-gray-100 rounded-lg font-bold text-gray-700 flex items-center gap-1 disabled:opacity-50">
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Export
          </button>
          <button onClick={clear} className="px-3 py-1.5 bg-red-50 rounded-lg font-bold text-red-600">
            Delete
          </button>
        </div>
      )}
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
        message: `Restore the backup from ${when} (${saved} saved lists, ${backup.items.length} items).\nEverything currently on this phone, including queued entries, will be replaced.`,
        confirmLabel: 'Restore',
        danger: true,
      });
      if (!ok) return;
      setBusy(true);
      await actions.restoreBackup(backup);
      dialogs.toast('Backup restored');
    } catch (err) {
      await dialogs.alert('Could not restore', err instanceof BackupError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3">
      <SectionTitle>Backup</SectionTitle>
      <p className="text-xs text-gray-500 leading-relaxed">
        Your data lives only on this phone. Save a backup file to Google Drive, WhatsApp or email now and then, so you can restore it on a new phone.
      </p>
      <p className={`text-xs font-bold ${lastBackup === 'never' ? 'text-red-600' : 'text-gray-700'}`}>Last backup: {lastBackup}</p>
      <div className="flex gap-3">
        <Button variant="primary" className="flex-1" onClick={doExport} disabled={busy}>
          <Download size={14} /> Save backup
        </Button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="flex-1 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl uppercase tracking-wider text-xs flex items-center justify-center gap-2 disabled:opacity-50"
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
  const [showHidden, setShowHidden] = useState(false);
  const [billPhotos, setBillPhotos] = useState<number | null>(null);
  useEffect(() => {
    void actions.countBillPhotos().then(setBillPhotos);
  }, [actions]);
  const clearBillPhotos = async () => {
    const ok = await dialogs.confirm(`Delete ${billPhotos} kept bill photos?`, {
      message: 'Frees space on the phone. The lines read from them stay; only the photos to check them against go.',
      confirmLabel: 'Delete photos',
      danger: true,
    });
    if (!ok) return;
    await actions.clearBillPhotos();
    setBillPhotos(0);
  };
  const clearHidden = async () => {
    const ok = await dialogs.confirm(`Clear ${hiddenMaterials.length} deleted ${hiddenMaterials.length === 1 ? 'material' : 'materials'} for good?`, {
      message:
        'Their old added rates are deleted, and their lines in saved lists stop counting in Rates and price checks for good. The saved lists and site reports keep the lines. This can\'t be restored.',
      confirmLabel: 'Clear for good',
      danger: true,
    });
    if (ok) await actions.clearHiddenMaterials();
  };
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
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <dt className="text-gray-500">Saved lists</dt>
        <dd className="font-bold text-right">{history.length}</dd>
        <dt className="text-gray-500">Items</dt>
        <dd className="font-bold text-right">{snapshot.items.length}</dd>
        <dt className="text-gray-500">Added rates</dt>
        <dd className="font-bold text-right">{snapshot.rates.length}</dd>
        <dt className="text-gray-500">Bill photos</dt>
        <dd className="font-bold text-right">
          {billPhotos ?? '…'}
          {!!billPhotos && (
            <button onClick={clearBillPhotos} className="ml-2 text-red-600 font-bold underline">
              Delete
            </button>
          )}
        </dd>
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
          <div className="flex justify-between items-center text-xs text-gray-500 mb-1">
            <span>Deleted from Rates ({hiddenMaterials.length})</span>
            <button onClick={() => setShowHidden((v) => !v)} className="text-blue-600 font-bold underline" aria-expanded={showHidden}>
              {showHidden ? 'Hide' : 'Show'}
            </button>
          </div>
          {showHidden && (
            <>
              <p className="text-xs text-gray-500 leading-snug mb-2">
                Each is remembered so its old prices stay out of Rates and price checks; new purchases of it still show. One leaves this list by itself once the
                saved lists and rates it hid are deleted. Restore brings its old prices back; Clear list makes the deletions final and empties the list.
              </p>
              <ul className="space-y-1">
                {hiddenMaterials.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 text-xs bg-gray-50 rounded-lg px-3 py-1.5">
                    <span className="truncate">
                      {m.name} <span className="text-gray-500">· per {m.unit}</span>
                    </span>
                    <button onClick={() => actions.unhideMaterial(m.id)} className="text-blue-600 font-bold underline shrink-0" aria-label={`Restore ${m.name} to Rates`}>
                      Restore
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex items-center justify-between gap-2">
                {hiddenMaterials.length > 1 ? (
                  <button
                    onClick={() => actions.unhideMaterials(hiddenMaterials.map((m) => m.id))}
                    className="text-xs text-blue-600 font-bold underline"
                    aria-label="Restore all deleted materials to Rates"
                  >
                    Restore all
                  </button>
                ) : (
                  <span />
                )}
                <Button variant="dangerOutline" size="sm" onClick={clearHidden}>
                  <Trash2 size={14} /> Clear list
                </Button>
              </div>
            </>
          )}
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
      <p className="text-xs text-gray-500 leading-snug">
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
      <button onClick={onForgetAll} className="text-xs text-red-600 font-bold underline">
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
      <p className="text-xs text-gray-500 leading-relaxed">
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
          <p className="text-xs text-gray-500">Sizes are width x length, separated by commas, e.g. {sizeLabel({ width: 600, length: 1200 }).replace(' mm', '')}, 800x1600.</p>
          <div className="flex gap-3 items-center">
            <Button variant="primary" size="sm" onClick={save}>
              Save
            </Button>
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

const REPO = 'parikshit99/nirman';

/** The diagnostic log kept on this phone, and the ways to send it. */
function DiagnosticsSection() {
  const dialogs = useDialogs();
  const [note, setNote] = useState('');
  const [, refresh] = useState(0);
  const log = getLog();
  const errors = log.filter((e) => e.kind === 'error').length;

  const report = () => {
    logStep('report problem');
    const url = issueUrl(REPO, note.trim());
    // On the phone, leaving the app's page opens the browser (signed in to GitHub there).
    if (isNative) window.location.href = url;
    else window.open(url, '_blank', 'noopener');
  };
  const shareLog = async () => {
    try {
      await shareFile(`nirman-diagnostics-${new Date().toISOString().slice(0, 10)}.txt`, textToBase64(logAsText()), 'text/plain');
    } catch (err) {
      await dialogs.alert('Could not share the log', (err as Error).message);
    }
  };

  return (
    <section className="space-y-2">
      <SectionTitle>Problems and diagnostics</SectionTitle>
      <p className="text-xs text-gray-500 leading-relaxed">
        The app keeps a log on this phone of errors, AI readings, the steps you take and slow screens, including the items, rates and vendors involved, to
        help fix problems. Photos and your API key are never recorded. {log.length} entries{errors ? `, ${errors} errors` : ''}.
      </p>
      <textarea
        aria-label="Describe the problem"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What happened? (optional, you can also add it on GitHub)"
        className="w-full h-16 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:ring-1 focus:ring-orange-400 resize-none"
      />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="sm" onClick={report}>
          Report a problem
        </Button>
        <button onClick={shareLog} className="py-2.5 bg-gray-100 text-gray-700 rounded-xl text-xs font-bold uppercase tracking-wider">
          Share log
        </button>
      </div>
      <p className="text-xs text-gray-500">Report a problem opens a GitHub issue with the phone details and recent errors filled in; you can add a screenshot there.</p>
      {log.length > 0 && (
        <button
          onClick={() => {
            clearLog();
            refresh((n) => n + 1);
          }}
          className="text-xs text-blue-600 font-bold underline"
        >
          Clear the log
        </button>
      )}
    </section>
  );
}
