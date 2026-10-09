import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import {
  BackupError,
  DEFAULT_MODEL,
  FALLBACK_MODELS,
  backupFilename,
  clearLog,
  describeLastBackup,
  getLog,
  issueUrl,
  listReadingModels,
  loadConversions,
  logAsText,
  logStep,
  recordBackup,
  resetConversions,
  saveConversions,
  testGeminiKey,
  type ModelOption,
  type ReadingMode,
} from '@nirman/core';
import { ACCENTS, contrast, parseSize, sizeLabel, type SheetSize } from '@nirman/shared';
import { Button } from '../components/ui/Button';
import { useDialogs } from '../components/ui/Dialogs';
import { Field, Label, NumberField } from '../components/ui/fields';
import { Icon } from '../components/ui/Icon';
import { Select } from '../components/ui/Select';
import { Sheet, SheetHeader } from '../components/ui/Sheet';
import { Tabs } from '../components/ui/Tabs';
import { pickBackupFile } from '../lib/backupFile';
import { latestNotes } from '../lib/changelog';
import { APP_VERSION } from '../lib/coreSetup';
import { shareBytes, shareFile, textToBase64 } from '../lib/files';
import { plural } from '../lib/format';
import { look, onLookChange, setAccent, setThemeChoice, setThemeStyle, themeChoice, type ThemeChoice, type ThemeStyle } from '../lib/theme';
import { useAppState } from '../state/AppState';
import { useColors } from '../theme';

/**
 * Gemini key, how bills are read, appearance, backup, and what is on this phone. On first launch it is a short
 * welcome that asks for the key (skippable: typing items in works without one); after the update from 6.x it asks
 * for the key again, as the old app's storage can't be read.
 */
export function SettingsSheet({ onClose, firstRun, onWhatsNew }: { onClose(): void; firstRun?: 'welcome' | 'key-again'; onWhatsNew?(): void }) {
  const c = useColors();
  return (
    <Sheet kind="screen" onClose={onClose} label={firstRun ? 'Welcome' : 'Settings'} gap={24}>
      <SheetHeader icon="settings" title={firstRun === 'key-again' ? 'Nirman is updated' : firstRun ? 'Welcome' : 'Settings'} onClose={onClose} />
      {firstRun === 'welcome' && (
        <Hint>
          Everything you record is stored only on this phone and works offline. Printed bills, typed lists and clear vendor quotes are read on the phone. For handwritten
          bills and unclear quotes, add your own Google Gemini API key below. You can skip this and add it later from Settings.
        </Hint>
      )}
      {firstRun === 'key-again' && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: c.gray800 }}>Paste your Gemini key again (needed once after this update).</Text>
          <Hint>All your purchase lists, BOQs, contracts and rates are here as before. Only the key has to be pasted again. The app works without it; bills are then read on the phone.</Hint>
        </View>
      )}
      <ApiKeySection onSaved={firstRun ? onClose : undefined} />
      {firstRun ? (
        <Button variant="secondary" block onPress={onClose}>
          Skip for now
        </Button>
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

function SectionTitle({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <Text accessibilityRole="header" style={{ fontSize: 12, fontWeight: '700', color: c.gray500 }}>
      {children}
    </Text>
  );
}

function Hint({ children, tone }: { children: ReactNode; tone?: 'error' | 'ok' }) {
  const c = useColors();
  return <Text style={{ fontSize: 12, lineHeight: 17, color: tone === 'error' ? c.red600 : tone === 'ok' ? c.green700 : c.gray500 }}>{children}</Text>;
}

/** A quiet text button inside a section ("Manage", "Restore"); at least 40 dp tall. */
function LinkButton({ children, onPress, danger, label, disabled }: { children: string; onPress(): void; danger?: boolean; label?: string; disabled?: boolean }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label ?? children} disabled={disabled} onPress={onPress} hitSlop={4} style={({ pressed }) => [styles.link, pressed && { backgroundColor: c.gray100 }, disabled && { opacity: 0.4 }]}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: danger ? c.red600 : c.orange700, textDecorationLine: 'underline' }}>{children}</Text>
    </Pressable>
  );
}

function ApiKeySection({ onSaved }: { onSaved?(): void }) {
  const c = useColors();
  const { settings, actions } = useAppState();
  const [key, setKey] = useState(settings.geminiApiKey);
  const [model, setModel] = useState(settings.geminiModel);
  const [show, setShow] = useState(false);
  const [state, setState] = useState<{ kind: 'idle' | 'testing' | 'ok' | 'error'; message?: string }>({ kind: 'idle' });
  const [models, setModels] = useState<ModelOption[]>(FALLBACK_MODELS);
  const [loadingModels, setLoadingModels] = useState(false);
  const [typing, setTyping] = useState(false);
  // The models this key can use, fetched once a key is saved.
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
    <View style={{ gap: 12 }}>
      <SectionTitle>AI reading (Gemini)</SectionTitle>
      <View style={{ gap: 4 }}>
        <Label>API key</Label>
        <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, borderColor: c.gray200, backgroundColor: c.white }}>
          <TextInput
            accessibilityLabel="API key"
            value={key}
            onChangeText={(t) => {
              setKey(t);
              setState({ kind: 'idle' });
            }}
            secureTextEntry={!show}
            autoComplete="off"
            autoCorrect={false}
            autoCapitalize="none"
            placeholder="AIza…"
            placeholderTextColor={c.gray500}
            style={{ flex: 1, minHeight: 44, paddingHorizontal: 12, fontSize: 14, fontFamily: 'monospace', color: c.brandDark }}
          />
          <Pressable accessibilityRole="button" accessibilityLabel={show ? 'Hide key' : 'Show key'} onPress={() => setShow(!show)} style={styles.iconButton}>
            <Icon name={show ? 'visibility-off' : 'visibility'} size={18} color={c.gray500} />
          </Pressable>
        </View>
        <Hint>Get a free key at aistudio.google.com → “Get API key”. It is stored encrypted on this phone only.</Hint>
      </View>
      <View style={{ gap: 4 }}>
        {typing ? (
          <Field label="Model" value={model} onChangeText={setModel} placeholder={DEFAULT_MODEL} autoFocus autoCapitalize="none" autoCorrect={false} mono />
        ) : (
          <Select
            label={loadingModels ? 'Model (checking…)' : 'Model'}
            value={model || DEFAULT_MODEL}
            options={[...options.map((m) => ({ value: m.id, label: m.label === m.id ? m.id : `${m.label} (${m.id})` })), { value: '__other', label: 'Other (type a name)…' }]}
            onChange={(v) => (v === '__other' ? setTyping(true) : setModel(v))}
          />
        )}
        <Hint>
          Flash is fast and cheap (best for bills); Flash-Lite is fastest; Pro is slower but more careful.{' '}
          {savedKey ? 'The list shows the models your key can use.' : 'Save a key to see every model it can use.'}
        </Hint>
      </View>
      {state.kind === 'error' && <Hint tone="error">{state.message}</Hint>}
      {state.kind === 'ok' && <Hint tone="ok">✓ {state.message}</Hint>}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Button style={{ flex: 1 }} icon={state.kind === 'testing' ? 'hourglass-empty' : undefined} onPress={test} disabled={!key.trim() || state.kind === 'testing'}>
          Test key
        </Button>
        <Button style={{ flex: 1 }} variant="primary" onPress={save} disabled={!dirty}>
          Save
        </Button>
      </View>
    </View>
  );
}

function AppearanceSection() {
  const c = useColors();
  const [choice, setChoice] = useState<ThemeChoice>(themeChoice);
  const { accent, style, wallpaper } = useSyncExternalStore(onLookChange, look);
  const fromWallpaper = style === 'wallpaper' && !!wallpaper;
  return (
    <View style={{ gap: 8 }}>
      <SectionTitle>Appearance</SectionTitle>
      <Tabs<ThemeChoice>
        label="Appearance"
        value={choice}
        onChange={(next) => {
          setChoice(next);
          setThemeChoice(next);
        }}
        options={[
          { id: 'system', label: 'Phone' },
          { id: 'light', label: 'Light' },
          { id: 'dark', label: 'Dark' },
        ]}
      />
      <Hint>Dark is easier on the eyes at night; Phone follows the phone's setting.</Hint>
      <Tabs<ThemeStyle>
        label="Colours"
        value={style}
        onChange={setThemeStyle}
        options={[
          { id: 'standard', label: 'Standard' },
          { id: 'wallpaper', label: 'Wallpaper' },
          { id: 'black', label: 'Pure black' },
        ]}
      />
      <Hint>
        {style === 'wallpaper'
          ? wallpaper
            ? "The app takes its colour from the phone's wallpaper. Pick a colour below to choose your own."
            : "This phone doesn't share its wallpaper colour (it needs Android 12 or newer), so the colour below is used."
          : style === 'black'
            ? 'Dark mode uses pure black, which saves battery on most phones (OLED screens).'
            : 'Pick the colour of buttons, tabs and highlights.'}
      </Hint>
      <View accessibilityRole="radiogroup" accessibilityLabel="App colour" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingVertical: 4 }}>
        {ACCENTS.map((a) => {
          const on = !fromWallpaper && a.hex === accent;
          // The tick is white or black, whichever shows on that colour.
          const tick = contrast('#ffffff', a.hex) >= 3 ? '#ffffff' : '#121212';
          return (
            <Pressable
              key={a.id}
              accessibilityRole="radio"
              accessibilityLabel={a.label}
              accessibilityState={{ checked: on }}
              onPress={() => {
                setAccent(a.hex);
                if (style === 'wallpaper') setThemeStyle('standard');
              }}
              style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: a.hex, borderWidth: on ? 3 : 0, borderColor: c.brandDark, opacity: fromWallpaper ? 0.5 : 1 }}
            >
              {on && <Icon name="check" size={22} color={tick} />}
            </Pressable>
          );
        })}
      </View>
      <Hint>Red, green and blue keep their meaning (problems, done, information) whatever colour is chosen. For the app icon to match the wallpaper, turn on Themed icons in the phone's wallpaper settings.</Hint>
    </View>
  );
}

const READING_MODES: { mode: ReadingMode; label: string; about: string }[] = [
  { mode: 'auto', label: 'Phone first (recommended)', about: 'Printed bills and typed lists are read on the phone, offline and instantly; Gemini only when the phone is unsure.' },
  { mode: 'phone', label: 'Phone only', about: 'Never sends anything to Gemini. Handwritten bills may need fixing by hand.' },
  { mode: 'gemini', label: 'Gemini always', about: 'Best for handwritten bills; needs internet and an API key.' },
];

function ReadingSection() {
  const c = useColors();
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
    const ok = await dialogs.confirm('Delete the kept bill photos?', { message: `${plural(samples ?? 0, 'bill')} kept for training will be deleted. Your purchase lists are not affected.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    await actions.clearTrainingSamples();
    setSamples(0);
  };

  return (
    <View style={{ gap: 8 }}>
      <SectionTitle>How bills are read</SectionTitle>
      <View accessibilityRole="radiogroup" accessibilityLabel="How bills are read" style={{ gap: 6 }}>
        {READING_MODES.map(({ mode, label, about }) => {
          const on = settings.readingMode === mode;
          return (
            <Pressable
              key={mode}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => set({ readingMode: mode })}
              style={({ pressed }) => [styles.choice, { borderColor: on ? c.orange400 : c.gray200, backgroundColor: on ? c.orange50 : pressed ? c.gray100 : c.white }]}
            >
              <Icon name={on ? 'radio-button-checked' : 'radio-button-unchecked'} size={20} color={on ? c.orange600 : c.gray400} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray800 }}>{label}</Text>
                <Text style={{ fontSize: 12, color: c.gray600 }}>{about}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingTop: 4 }}>
        <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, color: c.gray600 }}>
          <Text style={{ fontWeight: '700', color: c.gray800 }}>Keep bill photos for training.</Text> Each photographed bill is kept on this phone with the lines it became
          (as you correct them), to train an AI that runs on the phone later. Not included in backups.
        </Text>
        <Switch
          accessibilityLabel="Keep bill photos for training"
          value={settings.collectTraining}
          onValueChange={(v) => set({ collectTraining: v })}
          trackColor={{ true: c.orange300, false: c.gray300 }}
          thumbColor={settings.collectTraining ? c.brandPrimary : c.gray50}
        />
      </View>
      {!!samples && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ flex: 1, fontSize: 12, color: c.gray600 }}>{plural(samples, 'bill')} kept</Text>
          <Button size="sm" icon={busy ? 'hourglass-empty' : 'download'} onPress={exportData} disabled={busy}>
            Export
          </Button>
          <Button size="sm" variant="dangerOutline" onPress={clear}>
            Delete
          </Button>
        </View>
      )}
    </View>
  );
}

function BackupSection() {
  const c = useColors();
  const { actions } = useAppState();
  const dialogs = useDialogs();
  const [busy, setBusy] = useState(false);
  const [lastBackup, setLastBackup] = useState(describeLastBackup);

  const doExport = async () => {
    setBusy(true);
    try {
      const { bytes } = await actions.exportBackup();
      await shareBytes(backupFilename(), bytes, 'application/zip');
      recordBackup();
      setLastBackup(describeLastBackup());
    } catch (err) {
      await dialogs.alert('Backup failed', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    try {
      const bytes = await pickBackupFile();
      if (!bytes) return;
      const parsed = actions.parseBackup(bytes);
      const { backup } = parsed;
      const when = new Date(backup.exported_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      const saved = backup.lists.filter((l) => l.status === 'saved').length;
      const ok = await dialogs.confirm('Replace all data on this phone?', {
        message: `Restore the backup from ${when} (${plural(saved, 'saved list')}, ${plural(backup.items.length, 'item')}, ${parsed.photos.size ? plural(parsed.photos.size, 'bill photo') : 'no bill photos'}).\nEverything currently on this phone, including queued entries, will be replaced.`,
        confirmLabel: 'Restore',
        danger: true,
      });
      if (!ok) return;
      setBusy(true);
      await actions.restoreBackup(parsed);
      dialogs.toast('Backup restored');
    } catch (err) {
      await dialogs.alert('Could not restore', err instanceof BackupError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <SectionTitle>Backup</SectionTitle>
      <Hint>
        Your data lives only on this phone. Save a backup to Google Drive, WhatsApp or email every week, so you can restore it on a new phone. It is one .zip file with
        everything, bill photos included.
      </Hint>
      <Text style={{ fontSize: 12, fontWeight: '700', color: lastBackup === 'never' ? c.red600 : c.gray700 }}>Last backup: {lastBackup}</Text>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Button style={{ flex: 1 }} variant="primary" icon="download" onPress={doExport} disabled={busy}>
          Save backup
        </Button>
        <Button style={{ flex: 1 }} icon="upload" onPress={doImport} disabled={busy}>
          Restore
        </Button>
      </View>
      {busy && <ActivityIndicator color={c.brandPrimary} />}
    </View>
  );
}

const sizesText = (sizes: SheetSize[]) => sizes.map((z) => `${z.width}x${z.length}`).join(', ');
const parseSizes = (text: string) =>
  text
    .split(/[,;\n]+/)
    .map((t) => parseSize(t))
    .filter((z): z is SheetSize => !!z);

/** Bars per bundle, bar length and the tile / ACP sizes offered by the unit calculator. */
function ConversionsSection() {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const [initial] = useState(loadConversions);
  const [bars, setBars] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(initial.bundleBars).map(([d, n]) => [d, String(n)])));
  const [length, setLength] = useState(String(initial.barLength));
  const [tiles, setTiles] = useState(sizesText(initial.tileSizes));
  const [acp, setAcp] = useState(sizesText(initial.acpSizes));
  const [saved, setSaved] = useState(false);
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setSaved(false);
  };

  const save = () => {
    const bundleBars = Object.fromEntries(Object.entries(bars).map(([d, n]) => [d, Math.max(0, Math.round(Number(n) || 0))]));
    saveConversions({ bundleBars, barLength: Number(length) > 0 ? Number(length) : 12, tileSizes: parseSizes(tiles), acpSizes: parseSizes(acp) });
    setTiles(sizesText(loadConversions().tileSizes));
    setAcp(sizesText(loadConversions().acpSizes));
    setSaved(true);
  };
  const reset = () => {
    resetConversions();
    const d = loadConversions();
    setBars(Object.fromEntries(Object.entries(d.bundleBars).map(([k, n]) => [k, String(n)])));
    setLength(String(d.barLength));
    setTiles(sizesText(d.tileSizes));
    setAcp(sizesText(d.acpSizes));
    setSaved(true);
  };

  return (
    <View style={{ gap: 8 }}>
      <SectionTitle>TMT, tiles and ACP</SectionTitle>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Hint>Used to turn TMT bundles into kg and sqft into whole tiles or sheets.</Hint>
        </View>
        <LinkButton onPress={() => setOpen((v) => !v)}>{open ? 'Hide' : 'Edit'}</LinkButton>
      </View>
      {open && (
        <View style={{ gap: 12 }}>
          <View style={{ gap: 4 }}>
            <Label>Bars per bundle</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {Object.keys(bars)
                .sort((a, b) => Number(a) - Number(b))
                .map((d) => (
                  <View key={d} style={{ width: '30%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ width: 44, fontSize: 12, fontFamily: 'monospace', color: c.gray700 }}>{d} mm</Text>
                    <View style={{ flex: 1 }}>
                      <NumberField accessibilityLabel={`Bars per bundle for ${d} mm`} keyboardType="number-pad" value={bars[d]} onChangeText={edit((v: string) => setBars((b) => ({ ...b, [d]: v })))} />
                    </View>
                  </View>
                ))}
            </View>
          </View>
          <NumberField label="Standard bar length (m)" value={length} onChangeText={edit(setLength)} />
          <Field label="Tile sizes (mm)" value={tiles} onChangeText={edit(setTiles)} mono />
          <Field label="ACP sheet sizes (mm)" value={acp} onChangeText={edit(setAcp)} mono />
          <Hint>Sizes are width x length, separated by commas, e.g. {sizeLabel({ width: 600, length: 1200 }).replace(' mm', '')}, 800x1600.</Hint>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Button variant="primary" size="sm" onPress={save}>
              Save
            </Button>
            <LinkButton onPress={reset}>Reset to defaults</LinkButton>
            {saved && (
              <Text accessibilityLiveRegion="polite" style={{ fontSize: 12, fontWeight: '700', color: c.green700 }}>
                Saved
              </Text>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const REPO = 'parikshit99/nirman';

/** The problem log kept on this phone, and the ways to send it. */
function DiagnosticsSection() {
  const c = useColors();
  const dialogs = useDialogs();
  const [note, setNote] = useState('');
  const [, refresh] = useState(0);
  const log = getLog();
  const errors = log.filter((e) => e.kind === 'error').length;

  const report = () => {
    logStep('report problem');
    // Opens the browser (signed in to GitHub there) on a new issue with the phone details and recent errors.
    void Linking.openURL(issueUrl(REPO, note.trim())).catch((err: Error) => dialogs.alert('Could not open the browser', err.message));
  };
  const shareLog = async () => {
    try {
      await shareFile(`nirman-diagnostics-${new Date().toISOString().slice(0, 10)}.txt`, textToBase64(logAsText()), 'text/plain');
    } catch (err) {
      await dialogs.alert('Could not share the log', (err as Error).message);
    }
  };

  return (
    <View style={{ gap: 8 }}>
      <SectionTitle>Problems and diagnostics</SectionTitle>
      <Hint>
        The app keeps a log on this phone of errors, AI readings, the steps you take and slow screens, including the items, rates and vendors involved, to help fix
        problems. Photos and your API key are never recorded. {plural(log.length, 'entry', 'entries')}
        {errors ? `, ${plural(errors, 'error')}` : ''}.
      </Hint>
      <TextInput
        accessibilityLabel="Describe the problem"
        value={note}
        onChangeText={setNote}
        multiline
        placeholder="What happened? (optional, you can also add it on GitHub)"
        placeholderTextColor={c.gray500}
        style={{ minHeight: 64, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderRadius: 10, borderColor: c.gray200, backgroundColor: c.white, color: c.brandDark, fontSize: 12, textAlignVertical: 'top' }}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button style={{ flex: 1 }} size="sm" icon="bug-report" onPress={report}>
          Report a problem
        </Button>
        <Button style={{ flex: 1 }} size="sm" icon="share" onPress={shareLog}>
          Share log
        </Button>
      </View>
      <Hint>Report a problem opens a GitHub issue with the phone details and recent errors filled in; you can add a screenshot there.</Hint>
      {log.length > 0 && (
        <View style={{ alignItems: 'flex-start' }}>
          <LinkButton
            onPress={() => {
              clearLog();
              refresh((n) => n + 1);
            }}
          >
            Clear the log
          </LinkButton>
        </View>
      )}
    </View>
  );
}

/** One "label … value" row of On this phone; its label is read as one (the upgrade test in CI looks for them). */
function Row({ label, value, children }: { label: string; value: ReactNode; children?: ReactNode }) {
  const c = useColors();
  return (
    <View accessible={!children} accessibilityLabel={`${label}: ${typeof value === 'string' || typeof value === 'number' ? value : ''}`} style={styles.row}>
      <Text style={{ flex: 1, fontSize: 12, color: c.gray500 }}>{label}</Text>
      <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray800 }}>{value}</Text>
      {children}
    </View>
  );
}

function StorageSection({ onWhatsNew }: { onWhatsNew?(): void }) {
  const c = useColors();
  const { allHistory, snapshot, learningCount, hiddenMaterials, actions } = useAppState();
  const dialogs = useDialogs();
  const [showLearned, setShowLearned] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [billPhotos, setBillPhotos] = useState<number | null>(null);
  useEffect(() => {
    void actions.countBillPhotos().then(setBillPhotos);
  }, [actions]);
  const clearBillPhotos = async () => {
    const ok = await dialogs.confirm(`Delete ${plural(billPhotos ?? 0, 'kept bill photo')}?`, {
      message: 'Frees space on the phone. The lines read from them stay; only the photos to check them against go.',
      confirmLabel: 'Delete photos',
      danger: true,
    });
    if (!ok) return;
    await actions.clearBillPhotos();
    setBillPhotos(0);
  };
  const clearHidden = async () => {
    const ok = await dialogs.confirm(`Clear ${plural(hiddenMaterials.length, 'deleted material')} for good?`, {
      message:
        "Their old added rates are deleted, and their lines in saved lists stop counting in Rates and price checks for good. The saved lists and site reports keep the lines. This can't be restored.",
      confirmLabel: 'Clear for good',
      danger: true,
    });
    if (ok) await actions.clearHiddenMaterials();
  };
  const resetLearning = async () => {
    const ok = await dialogs.confirm(`Forget ${plural(learningCount, 'learned correction')}?`, {
      message: 'The AI will go back to its default reading of these terms.',
      confirmLabel: 'Forget',
      danger: true,
    });
    if (ok) await actions.clearLearning();
  };
  return (
    <View style={{ gap: 4 }}>
      <SectionTitle>On this phone</SectionTitle>
      <Row label="Projects" value={snapshot.projects.length} />
      <Row label="Saved lists" value={allHistory.length} />
      <Row label="Items" value={snapshot.items.length} />
      <Row label="Added rates" value={snapshot.rates.length} />
      <Row label="Bill photos" value={billPhotos ?? '…'}>
        {!!billPhotos && <LinkButton danger label="Delete bill photos" onPress={clearBillPhotos}>Delete</LinkButton>}
      </Row>
      <Row label="Queued AI entries" value={snapshot.jobs.length} />
      <Row label="Learned corrections" value={learningCount}>
        {learningCount > 0 && <LinkButton label={showLearned ? 'Hide learned corrections' : 'Manage learned corrections'} onPress={() => setShowLearned((v) => !v)}>{showLearned ? 'Hide' : 'Manage'}</LinkButton>}
      </Row>
      <Row label="App version" value={APP_VERSION}>
        {onWhatsNew && latestNotes && <LinkButton onPress={onWhatsNew}>What's new</LinkButton>}
      </Row>
      {showLearned && learningCount > 0 && <LearnedCorrections onForgetAll={resetLearning} />}
      {hiddenMaterials.length > 0 && (
        <View style={{ paddingTop: 8, gap: 6 }}>
          <View style={styles.row}>
            <Text style={{ flex: 1, fontSize: 12, color: c.gray500 }}>Deleted from Rates ({hiddenMaterials.length})</Text>
            <LinkButton onPress={() => setShowHidden((v) => !v)}>{showHidden ? 'Hide' : 'Show'}</LinkButton>
          </View>
          {showHidden && (
            <>
              <Hint>
                Each is remembered so its old prices stay out of Rates and price checks; new purchases of it still show. One leaves this list by itself once the saved lists
                and rates it hid are deleted. Restore brings its old prices back; Clear list makes the deletions final and empties the list.
              </Hint>
              {hiddenMaterials.map((m) => (
                <View key={m.id} style={[styles.listRow, { backgroundColor: c.gray50 }]}>
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, color: c.gray800 }}>
                    {m.name} <Text style={{ color: c.gray500 }}>· per {m.unit}</Text>
                  </Text>
                  <LinkButton label={`Restore ${m.name} to Rates`} onPress={() => void actions.unhideMaterial(m.id)}>
                    Restore
                  </LinkButton>
                </View>
              ))}
              <View style={[styles.row, { justifyContent: 'space-between' }]}>
                {hiddenMaterials.length > 1 ? (
                  <LinkButton label="Restore all deleted materials to Rates" onPress={() => void actions.unhideMaterials(hiddenMaterials.map((m) => m.id))}>
                    Restore all
                  </LinkButton>
                ) : (
                  <View />
                )}
                <Button variant="dangerOutline" size="sm" icon="delete-outline" onPress={clearHidden}>
                  Clear list
                </Button>
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );
}

/** Each remembered correction: the word as written or spoken, and the name and unit it is read as. */
function LearnedCorrections({ onForgetAll }: { onForgetAll(): void }) {
  const c = useColors();
  const { snapshot, actions } = useAppState();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ item_name: '', unit: '' });
  const q = query.trim().toLowerCase();
  const terms = [...snapshot.learned].sort((a, b) => a.id.localeCompare(b.id)).filter((t) => !q || t.id.includes(q) || t.item_name.toLowerCase().includes(q));

  return (
    <View style={{ paddingTop: 8, gap: 6 }}>
      <Hint>Words the app has learned to read your way, from your edits. Change what a word is read as, or delete it so the AI reads it fresh.</Hint>
      {snapshot.learned.length > 6 && <Field accessibilityLabel="Search learned corrections" value={query} onChangeText={setQuery} placeholder="Search words or names" />}
      {terms.map((t) =>
        editing === t.id ? (
          <View key={t.id} style={[styles.listRow, { flexDirection: 'column', alignItems: 'stretch', backgroundColor: c.orange50, gap: 6 }]}>
            <Text style={{ fontSize: 12, fontFamily: 'monospace', color: c.gray600 }}>“{t.id}” is read as</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <View style={{ flex: 1 }}>
                <Field accessibilityLabel="Read as name" value={draft.item_name} onChangeText={(v) => setDraft((d) => ({ ...d, item_name: v }))} />
              </View>
              <View style={{ width: 88 }}>
                <Field accessibilityLabel="Read as unit" value={draft.unit} onChangeText={(v) => setDraft((d) => ({ ...d, unit: v }))} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="ghost" size="sm" onPress={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                label={`Save correction for ${t.id}`}
                disabled={!draft.item_name.trim()}
                onPress={async () => {
                  await actions.updateLearnedTerm(t.id, draft);
                  setEditing(null);
                }}
              >
                Save
              </Button>
            </View>
          </View>
        ) : (
          <View key={t.id} style={[styles.listRow, { backgroundColor: c.gray50 }]}>
            <Text style={{ flex: 1, fontSize: 12, color: c.gray800 }}>
              <Text style={{ fontFamily: 'monospace', color: c.gray600 }}>{t.id}</Text> → <Text style={{ fontWeight: '700' }}>{t.item_name}</Text>{' '}
              <Text style={{ color: c.gray500 }}>· {t.unit}</Text>
            </Text>
            <LinkButton
              label={`Edit correction for ${t.id}`}
              onPress={() => {
                setEditing(t.id);
                setDraft({ item_name: t.item_name, unit: t.unit });
              }}
            >
              Edit
            </LinkButton>
            <LinkButton danger label={`Delete correction for ${t.id}`} onPress={() => void actions.deleteLearnedTerm(t.id)}>
              Delete
            </LinkButton>
          </View>
        ),
      )}
      {terms.length === 0 && <Hint>No match.</Hint>}
      <View style={{ alignItems: 'flex-start' }}>
        <LinkButton danger onPress={onForgetAll}>
          Forget all learned corrections
        </LinkButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  link: { minHeight: 40, minWidth: 40, paddingHorizontal: 8, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  choice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 12, borderWidth: 1 },
  row: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 12, paddingRight: 4, paddingVertical: 2, borderRadius: 8 },
});
