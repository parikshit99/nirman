import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Text, TextInput, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { MAX_IMAGES, todayISO } from '@nirman/shared';
import { type Job, type ListKind, prefs, workTypeKey, type ReadingProgress } from '@nirman/core';
import { PhotoSourceSheet } from '../components/PhotoSourceSheet';
import { Button } from '../components/ui/Button';
import { useDialogs } from '../components/ui/Dialogs';
import { Icon } from '../components/ui/Icon';
import { Select } from '../components/ui/Select';
import { chooseFromGallery, takePhoto } from '../lib/camera';
import { dataUrlToBase64 } from '../lib/images';
import { startDictation, type SpeechLanguage } from '../lib/speech';
import { useAppState } from '../state/AppState';
import { useColors } from '../theme';
import { ManualEntry } from './ManualEntry';

/** Photos or text shared from another app, to put into the entry (Phase 7). */
export interface IncomingShare {
  images: string[];
  text: string;
}

/** The entry form of the Add sheet: bill photos, voice or typed text, or an item typed in by hand. */
export function CapturePanel({ kind, onVendorQuote, incoming, onIncomingUsed, onQueued }: { kind: ListKind; onVendorQuote?(): void; incoming?: IncomingShare | null; onIncomingUsed?(): void; onQueued?(): void }) {
  const c = useColors();
  const { actions, boqNotes, categoryNames, itemsFor, openIds } = useAppState();
  const dialogs = useDialogs();
  const [inputText, setInputText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [sourceMenu, setSourceMenu] = useState(false);
  // Remembered (also for the next list), so the Save form starts with the same work type.
  const [category, setCategoryState] = useState(() => prefs.get(workTypeKey(kind), '') || categoryNames[0] || 'Civil');
  const setCategory = (v: string) => {
    setCategoryState(v);
    prefs.set(workTypeKey(kind), v);
  };
  const [listening, setListening] = useState(false);
  const [manual, setManual] = useState(false);
  const [language, setLanguage] = useState<SpeechLanguage>('en-IN');
  const stopDictation = useRef<(() => void) | null>(null);
  const canRead = !!inputText.trim() || images.length > 0;

  const usedShare = useRef<IncomingShare | null>(null);
  useEffect(() => {
    if (!incoming || usedShare.current === incoming) return;
    usedShare.current = incoming;
    setImages((prev) => [...prev, ...incoming.images].slice(0, MAX_IMAGES));
    if (incoming.text) setInputText((prev) => (prev ? `${prev}\n${incoming.text}` : incoming.text));
    onIncomingUsed?.();
  }, [incoming, onIncomingUsed]);

  const addImages = async (pending: (string | null)[]) => {
    const results = pending.filter((x): x is string => !!x);
    setImages((prev) => [...prev, ...results].slice(0, MAX_IMAGES));
  };

  const pickFrom = async (source: 'camera' | 'gallery') => {
    setSourceMenu(false);
    try {
      if (source === 'camera') await addImages([await takePhoto()]);
      else await addImages(await chooseFromGallery(MAX_IMAGES - images.length));
    } catch (err) {
      await dialogs.alert(source === 'camera' ? 'Could not open the camera' : 'Could not open the gallery', (err as Error).message);
    }
  };

  const toggleListening = async () => {
    if (listening) {
      stopDictation.current?.();
      return;
    }
    try {
      stopDictation.current = await startDictation(language, {
        onText: (text) => setInputText((prev) => prev + (prev ? ' ' : '') + text),
        onEnd: () => {
          setListening(false);
          stopDictation.current = null;
        },
        onError: (message) => void dialogs.alert('Voice input stopped', message),
      });
      setListening(true);
    } catch (err) {
      await dialogs.alert('Voice input unavailable', (err as Error).message);
    }
  };

  const handleProcess = async () => {
    if (!canRead) return;
    stopDictation.current?.();
    await actions.enqueueJob({
      listId: openIds[kind],
      text: inputText.trim(),
      images: images.map(dataUrlToBase64),
      category,
      captureDate: todayISO(),
    });
    setInputText('');
    setImages([]);
    onQueued?.();
  };

  const small = { minHeight: 40, paddingHorizontal: 10, borderRadius: 8, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 };

  return (
    <View style={{ gap: 16 }}>
      {itemsFor(kind).length === 0 && (
        <View style={{ padding: 12, flexDirection: 'row', gap: 12, borderRadius: 12, borderWidth: 1, borderColor: c.gray200, backgroundColor: c.gray50 }}>
          <Icon name="storage" size={18} color={c.gray500} />
          <Text style={{ flex: 1, fontSize: 12, lineHeight: 18, color: c.gray600 }}>
            {kind === 'audit'
              ? 'Everything is stored only on this phone. Type items in with “Add item manually”, or add a bill photo, voice note or text: the phone reads it first, and Gemini helps with what it can’t read (when you are online).'
              : 'A list for price quotes: type items in with “Add item manually”, or let a photo, voice note or text be read. Rate and total are left blank for vendors.'}
          </Text>
        </View>
      )}

      {kind === 'boq' && onVendorQuote && (
        <Pressable accessibilityRole="button" onPress={onVendorQuote} style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: 2, borderColor: c.orange200, backgroundColor: c.white }}>
          <Icon name="local-shipping" size={20} color={c.orange500} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray900 }}>Vendor quote received</Text>
            <Text style={{ fontSize: 12, color: c.gray500 }}>Scan a vendor's reply, in any format, and match it to a saved BOQ to compare prices.</Text>
          </View>
        </Pressable>
      )}

      {manual ? (
        <ManualEntry kind={kind} onClose={() => setManual(false)} />
      ) : (
        <Button block icon="keyboard" onPress={() => setManual(true)}>
          Add item manually (no AI)
        </Button>
      )}

      <View style={{ borderWidth: 2, borderStyle: images.length ? 'solid' : 'dashed', borderColor: c.brandConcrete, borderRadius: 12, padding: 16, minHeight: 128, justifyContent: 'center', backgroundColor: images.length ? c.gray50 : 'transparent' }}>
        {images.length > 0 ? (
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {images.map((src, idx) => (
                <View key={idx} style={{ width: '31%', aspectRatio: 1, borderRadius: 8, borderWidth: 1, borderColor: c.gray200, overflow: 'hidden', backgroundColor: c.white }}>
                  <Image source={{ uri: src }} accessibilityLabel={`Page ${idx + 1}`} style={{ width: '100%', height: '100%' }} />
                  <Pressable accessibilityRole="button" accessibilityLabel={`Remove image ${idx + 1}`} onPress={() => setImages((prev) => prev.filter((_, i) => i !== idx))} style={{ position: 'absolute', top: 2, right: 2, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.red500, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="delete" size={14} color="#fff" />
                    </View>
                  </Pressable>
                </View>
              ))}
              {images.length < MAX_IMAGES && (
                <Pressable accessibilityRole="button" onPress={() => setSourceMenu(true)} style={{ width: '31%', aspectRatio: 1, borderRadius: 8, borderWidth: 2, borderStyle: 'dashed', borderColor: c.gray300, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                  <Icon name="add" size={20} color={c.gray500} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray500 }}>Add more</Text>
                </Pressable>
              )}
            </View>
            <Text style={{ textAlign: 'center', fontSize: 12, fontWeight: '700', color: c.orange600 }}>
              {images.length} of {MAX_IMAGES} photos added
            </Text>
          </View>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setSourceMenu(true)} style={{ alignItems: 'center', gap: 4, minHeight: 80, justifyContent: 'center' }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.gray100, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
              <Icon name="photo-camera" size={24} color={c.gray500} />
            </View>
            <Text style={{ fontSize: 14, fontWeight: '500', color: c.gray600 }}>Take or choose bill photos</Text>
            <Text style={{ fontSize: 12, fontWeight: '600', color: c.gray500 }}>Up to {MAX_IMAGES} photos for one bill</Text>
          </Pressable>
        )}
      </View>

      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray500 }}>Or type or speak it</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {!!inputText && (
              <Pressable accessibilityRole="button" onPress={() => setInputText('')} style={[small, { backgroundColor: c.gray100 }]}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray500 }}>Clear</Text>
              </Pressable>
            )}
            <Pressable accessibilityRole="button" accessibilityLabel="Voice input language" disabled={listening} onPress={() => setLanguage((l) => (l === 'en-IN' ? 'hi-IN' : 'en-IN'))} style={[small, { backgroundColor: c.gray100, opacity: listening ? 0.5 : 1 }]}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray500 }}>{language === 'en-IN' ? 'EN' : 'हिं'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={toggleListening} style={[small, { backgroundColor: listening ? c.red500 : c.gray100 }]}>
              <Icon name={listening ? 'mic-off' : 'mic'} size={14} color={listening ? '#fff' : c.gray500} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: listening ? '#fff' : c.gray500 }}>{listening ? 'Stop' : 'Voice'}</Text>
            </Pressable>
          </View>
        </View>
        <TextInput
          accessibilityLabel="Type or speak it"
          multiline
          value={inputText}
          onChangeText={setInputText}
          placeholder={kind === 'audit' ? "Example: '15 bori cement bought for 7500'" : "Example: 'Item: Brickwork, Quantity: 500 sqft, Rate: 45'"}
          placeholderTextColor={c.gray500}
          textAlignVertical="top"
          style={{ height: 128, padding: 16, borderWidth: 1, borderColor: c.brandConcrete, borderRadius: 12, backgroundColor: c.gray50, color: c.brandDark, fontSize: 14 }}
        />
      </View>

      <Select label="Work type" value={category} options={categoryNames.map((n) => ({ value: n, label: n }))} onChange={setCategory} />

      {kind === 'boq' && <BoqNotes notes={boqNotes} onChange={(n) => actions.setListNotes(openIds.boq, n)} />}

      <View style={{ gap: 8 }}>
        <Button variant="primary" block icon="fact-check" disabled={!canRead} onPress={handleProcess}>
          Read items
        </Button>
        {!canRead && <Text style={{ fontSize: 12, color: c.gray500, textAlign: 'center' }}>Add a bill photo or type what {kind === 'audit' ? 'was bought' : 'you need'} first.</Text>}
      </View>
      {sourceMenu && <PhotoSourceSheet remaining={MAX_IMAGES - images.length} onPick={pickFrom} onClose={() => setSourceMenu(false)} />}
    </View>
  );
}

/** Notes are edited locally and saved shortly after typing stops. */
function BoqNotes({ notes, onChange }: { notes: string; onChange(n: string): void }) {
  const c = useColors();
  const [value, setValue] = useState(notes);
  const [lastSeen, setLastSeen] = useState(notes);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<string | null>(null);
  const save = useRef(onChange);
  save.current = onChange;
  // Don't lose the last keystrokes when closing the sheet.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (pending.current !== null) save.current(pending.current);
    },
    [],
  );
  if (notes !== lastSeen) {
    // Updated elsewhere (restoring a backup or a saved list).
    setLastSeen(notes);
    setValue(notes);
  }
  const update = (next: string) => {
    setValue(next);
    pending.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      pending.current = null;
      onChange(next);
    }, 500);
  };
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: c.blue600 }}>General specifications</Text>
        {!!value && (
          <Pressable accessibilityRole="button" onPress={() => update('')} style={{ minHeight: 40, justifyContent: 'center' }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: c.blue600 }}>Clear all</Text>
          </Pressable>
        )}
      </View>
      <TextInput
        multiline
        value={value}
        onChangeText={update}
        placeholder="Enter color codes, finishes (glossy/matt), or specific brand requests here for the PDF..."
        placeholderTextColor={c.gray500}
        textAlignVertical="top"
        style={{ height: 96, padding: 12, borderWidth: 1, borderColor: c.blue100, borderRadius: 12, backgroundColor: c.blue50, color: c.brandDark, fontSize: 12 }}
      />
    </View>
  );
}

/** Entries being read (or waiting to be), for the list's kind. */
export function QueuedReadings({ kind }: { kind: ListKind }) {
  const { actions, status, settings, jobsFor } = useAppState();
  const jobs = jobsFor(kind);
  if (jobs.length === 0) return null;
  return <JobList jobs={jobs} current={status.current} offline={!status.online} hasKey={!!settings.geminiApiKey || settings.readingMode !== 'gemini'} onRetry={actions.retryJob} onDelete={(j) => actions.deleteJob(j.id)} />;
}

/** Where an entry is being read (phone or Gemini), what step, and a bar; Gemini's bar follows the time taken. */
function ReadingBar({ current, photos }: { current: ReadingProgress; photos: number }) {
  const c = useColors();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (current.progress !== null) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [current.progress]);
  const seconds = Math.max(0, Math.round((now - current.startedAt) / 1000));
  // Gemini usually answers in 5–30 s; the bar slows as it nears the end rather than stopping.
  const expected = photos ? 20 : 6;
  const value = current.progress ?? Math.min(0.95, 1 - Math.exp(-seconds / expected));
  const phone = current.engine === 'phone';
  return (
    <View accessibilityLiveRegion="polite" style={{ marginTop: 4, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: phone ? c.green100 : c.blue100 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: phone ? c.green800 : c.blue800 }}>{phone ? 'On phone' : 'Gemini'}</Text>
        </View>
        <Text style={{ fontSize: 12, color: c.gray600 }}>{current.step}</Text>
        {!phone && <Text style={{ fontSize: 12, fontVariant: ['tabular-nums'], color: c.gray500 }}>{seconds}s</Text>}
      </View>
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }} style={{ height: 6, borderRadius: 3, backgroundColor: c.gray200, overflow: 'hidden' }}>
        <View style={{ height: '100%', width: `${Math.max(4, value * 100)}%`, backgroundColor: phone ? c.green500 : c.blue500 }} />
      </View>
      {!phone && current.model ? <Text numberOfLines={1} style={{ fontSize: 12, fontVariant: ['tabular-nums'], color: c.gray500 }}>{current.model}</Text> : null}
    </View>
  );
}

function JobList({ jobs, current, offline, hasKey, onRetry, onDelete }: { jobs: Job[]; current: ReadingProgress | null; offline: boolean; hasKey: boolean; onRetry(job: Job): void; onDelete(job: Job): void }) {
  const c = useColors();
  const waitingReason = !hasKey ? 'Add your Gemini API key in Settings' : offline ? 'Will be read when online' : 'Queued';
  return (
    <View style={{ gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: c.gray500 }}>Being read</Text>
      {jobs.map((job) => {
        const label = job.text ? `“${job.text.slice(0, 60)}${job.text.length > 60 ? '…' : ''}”` : '';
        const photos = job.image_count ? `${job.image_count} photo${job.image_count > 1 ? 's' : ''}` : '';
        const reading = current?.jobId === job.id ? current : null;
        const busy = !!reading || job.status === 'processing';
        const failed = job.status === 'failed';
        return (
          <View key={job.id} style={{ padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 12, borderWidth: 1, borderColor: failed ? c.red100 : c.gray100, backgroundColor: failed ? c.red50 : c.gray50 }}>
            <View style={{ marginTop: 2 }}>{busy ? <ActivityIndicator size={14} color={c.orange500} /> : <Icon name={failed ? 'warning' : 'cloud-off'} size={14} color={failed ? c.red500 : c.gray500} />}</View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '700', color: c.gray700 }}>
                {[photos, label].filter(Boolean).join(' · ') || 'Entry'}
              </Text>
              {reading ? <ReadingBar current={reading} photos={job.image_count} /> : <Text style={{ fontSize: 12, color: failed ? c.red600 : c.gray500 }}>{job.status === 'processing' ? 'Reading…' : failed ? job.error : waitingReason}</Text>}
            </View>
            {!busy && (
              <View style={{ flexDirection: 'row' }}>
                {failed && (
                  <Pressable accessibilityRole="button" accessibilityLabel="Retry" onPress={() => onRetry(job)} style={{ minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center', margin: -8 }}>
                    <Icon name="refresh" size={16} color={c.gray500} />
                  </Pressable>
                )}
                <Pressable accessibilityRole="button" accessibilityLabel="Remove from queue" onPress={() => onDelete(job)} style={{ minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center', margin: -8 }}>
                  <Icon name="delete-outline" size={16} color={c.gray500} />
                </Pressable>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
