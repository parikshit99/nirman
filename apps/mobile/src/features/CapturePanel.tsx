import { useEffect, useRef, useState } from 'react';
import { MAX_IMAGES, todayISO } from '@nirman/shared';
import {
  AlertTriangle,
  Camera,
  ClipboardCheck,
  CloudOff,
  Database,
  Keyboard,
  Image as ImageIcon,
  Loader2,
  Mic,
  MicOff,
  Plus,
  RotateCcw,
  Smartphone,
  Sparkles,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { useDialogs } from '../components/Dialogs.tsx';
import { PhotoSourceSheet } from '../components/PhotoSourceSheet.tsx';
import type { Job, ListKind } from '../data/repo.ts';
import { chooseFromGallery, takePhoto } from '../lib/camera.ts';
import { compressImage, dataUrlToBase64, readFileAsDataUrl } from '../lib/images.ts';
import { isNative } from '../lib/platform.ts';
import { startDictation, type SpeechLanguage } from '../lib/speech.ts';
import { useAppState } from '../state/AppState.tsx';
import { prefs } from '../lib/prefs.ts';
import { workTypeKey } from '../lib/workType.ts';
import type { IncomingShare } from '../lib/sharedFiles.ts';
import type { ReadingProgress } from '../jobs/worker.ts';
import { ManualEntry } from './ManualEntry.tsx';

export function CapturePanel({
  kind,
  onVendorQuote,
  incoming,
  onIncomingUsed,
  onQueued,
  showJobs = true,
  inSheet = false,
}: {
  kind: ListKind;
  onVendorQuote?(): void;
  /** After an entry is sent to be read (the add sheet closes so the list shows). */
  onQueued?(): void;
  /** False when the readings in progress are shown beside the list instead. */
  showJobs?: boolean;
  /** Inside the Add sheet, which has its own title. */
  inSheet?: boolean;
  /** Photos or text shared from another app, to put into this entry. */
  incoming?: IncomingShare | null;
  onIncomingUsed?(): void;
}) {
  const { actions, status, settings, boqNotes, categoryNames, jobsFor, itemsFor, draftIds } = useAppState();
  const dialogs = useDialogs();
  const [inputText, setInputText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [sourceMenu, setSourceMenu] = useState(false);
  // Remembered (also for the next list), so the Save form starts with the same work type.
  const [category, setCategoryState] = useState(() => prefs.get(workTypeKey(kind), '') || categoryNames[0] || 'Civil');
  const setCategory = (c: string) => {
    setCategoryState(c);
    prefs.set(workTypeKey(kind), c);
  };
  const [listening, setListening] = useState(false);
  const [manual, setManual] = useState(false);
  const [language, setLanguage] = useState<SpeechLanguage>('en-IN');
  const stopDictation = useRef<(() => void) | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jobs = jobsFor(kind);

  const usedShare = useRef<IncomingShare | null>(null);
  useEffect(() => {
    if (!incoming || usedShare.current === incoming) return;
    usedShare.current = incoming;
    setImages((prev) => [...prev, ...incoming.images].slice(0, MAX_IMAGES));
    if (incoming.text) setInputText((prev) => (prev ? `${prev}\n${incoming.text}` : incoming.text));
    onIncomingUsed?.();
  }, [incoming, onIncomingUsed]);

  const addImages = async (dataUrls: (string | Promise<string | null>)[]) => {
    const results = (await Promise.all(dataUrls)).filter((x): x is string => !!x);
    setImages((prev) => [...prev, ...results].slice(0, MAX_IMAGES));
  };

  const handleFiles = async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (images.length + imageFiles.length > MAX_IMAGES) {
      await dialogs.alert(`You can add up to ${MAX_IMAGES} images at once.`);
      return;
    }
    await addImages(imageFiles.map(async (f) => compressImage(await readFileAsDataUrl(f))));
  };

  const addPhoto = async () => {
    if (images.length >= MAX_IMAGES) return;
    if (isNative) setSourceMenu(true);
    else fileInputRef.current?.click();
  };

  const pickFrom = async (source: 'camera' | 'gallery') => {
    setSourceMenu(false);
    try {
      if (source === 'camera') await addImages([takePhoto()]);
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
    if (!inputText.trim() && images.length === 0) return;
    stopDictation.current?.();
    await actions.enqueueJob({
      listId: draftIds[kind],
      text: inputText.trim(),
      images: images.map(dataUrlToBase64),
      category,
      captureDate: todayISO(),
    });
    setInputText('');
    setImages([]);
    onQueued?.();
  };


  return (
    <>
      {itemsFor(kind).length === 0 && (
        <div className="mb-6 p-3 bg-gray-50 border border-gray-200 rounded-xl flex items-start gap-3">
          <Database size={18} className="text-gray-500 mt-0.5 shrink-0" />
          <p className="text-xs text-gray-600 leading-normal">
            {kind === 'audit'
              ? 'Everything is stored only on this phone. Type items in with “Add item manually”, or add a bill photo, voice note or text: the phone reads it first, and Gemini helps with what it can’t read (when you are online).'
              : 'A list for price quotes: type items in with “Add item manually”, or let a photo, voice note or text be read. Rate and total are left blank for vendors.'}
          </p>
        </div>
      )}

      {kind === 'boq' && onVendorQuote && (
        <button
          onClick={onVendorQuote}
          className="mb-6 w-full p-4 bg-white border-2 border-orange-200 rounded-xl flex items-center gap-3 text-left hover:border-orange-400 transition-colors"
        >
          <Truck size={20} className="text-orange-500 shrink-0" />
          <span>
            <span className="block text-xs font-bold text-gray-900">Vendor quote received</span>
            <span className="block text-xs text-gray-500 leading-normal">
              Scan a vendor's reply, in any format, and match it to a saved BOQ to compare prices.
            </span>
          </span>
        </button>
      )}

      <div className="mb-8">
        {!inSheet && (
          <h2 className="text-xs text-gray-500 mb-4 flex items-center gap-2 font-semibold">
            <Plus size={12} /> New {kind === 'audit' ? 'purchase' : 'BOQ'} entry
          </h2>
        )}

        <div className="space-y-4">
          {manual ? (
            <ManualEntry kind={kind} onClose={() => setManual(false)} />
          ) : (
            <button
              onClick={() => setManual(true)}
              className="w-full h-11 bg-white border border-[var(--color-brand-concrete)] text-[var(--color-brand-dark)] font-bold rounded-xl flex items-center justify-center gap-2 text-sm hover:bg-gray-50"
            >
              <Keyboard size={16} /> Add item manually (no AI)
            </button>
          )}

          <div
            className={`relative border-2 border-dashed rounded-xl transition-all min-h-[8rem] md:min-h-[12rem] flex flex-col items-center justify-center gap-4 p-4
              ${dragActive ? 'border-[var(--color-brand-primary)] bg-orange-50' : 'border-[var(--color-brand-concrete)] hover:border-gray-400'}
              ${images.length > 0 ? 'bg-gray-50 border-solid' : 'bg-transparent'}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              if (e.dataTransfer.files) void handleFiles(e.dataTransfer.files);
            }}
          >
            {images.length > 0 ? (
              <div className="w-full">
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {images.map((src, idx) => (
                    <div key={idx} className="relative aspect-square bg-white rounded-lg border border-gray-200 overflow-hidden">
                      <img src={src} alt={`Page ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                        className="absolute top-1 right-1 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center shadow"
                        aria-label={`Remove image ${idx + 1}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                  {images.length < MAX_IMAGES && (
                    <button
                      onClick={addPhoto}
                      className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 text-gray-500 hover:border-gray-500 hover:text-gray-500 transition-all bg-white/50"
                    >
                      <Plus size={20} />
                      <span className="text-xs font-bold uppercase">Add more</span>
                    </button>
                  )}
                </div>
                <p className="text-center text-xs text-orange-600 font-bold leading-none">
                  {images.length} of {MAX_IMAGES} photos added
                </p>
              </div>
            ) : (
              <button className="text-center" onClick={addPhoto}>
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 mx-auto mb-2">
                  {isNative ? <Camera size={24} /> : <ImageIcon size={24} />}
                </div>
                <p className="text-sm font-medium text-gray-600">{isNative ? 'Take or choose bill photos' : 'Choose bill photos'}</p>
                <p className="text-xs text-gray-500 font-semibold">Up to {MAX_IMAGES} photos for one bill</p>
              </button>
            )}
            <input
              type="file"
              className="hidden"
              ref={fileInputRef}
              accept="image/*"
              multiple
              onChange={(e) => {
                if (e.target.files) void handleFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center gap-2">
              <label htmlFor="capture-text" className="text-xs text-gray-500 font-bold">
                Or type or speak it
              </label>
              <div className="flex gap-2">
                {inputText && (
                  <button
                    onClick={() => setInputText('')}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-bold uppercase bg-gray-100 text-gray-500 hover:text-red-500"
                  >
                    <X size={10} /> Clear
                  </button>
                )}
                <button
                  onClick={() => setLanguage((l) => (l === 'en-IN' ? 'hi-IN' : 'en-IN'))}
                  disabled={listening}
                  className="px-2 py-1 rounded-md text-xs font-bold uppercase bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-50"
                  title="Voice input language"
                >
                  {language === 'en-IN' ? 'EN' : 'हिं'}
                </button>
                <button
                  onClick={toggleListening}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-bold uppercase transition-all
                    ${listening ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >
                  {listening ? <MicOff size={10} /> : <Mic size={10} />}
                  {listening ? 'Stop' : 'Voice'}
                </button>
              </div>
            </div>
            <textarea
              id="capture-text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={kind === 'audit' ? "Example: '15 bori cement bought for 7500'" : "Example: 'Item: Brickwork, Quantity: 500 sqft, Rate: 45'"}
              className="w-full h-32 p-4 bg-gray-50 border border-[var(--color-brand-concrete)] rounded-xl text-sm focus:ring-1 focus:ring-[var(--color-brand-primary)] focus:border-[var(--color-brand-primary)] outline-none transition-all resize-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <label htmlFor="capture-category" className="text-xs text-gray-500 font-bold shrink-0">
              Work type
            </label>
            <select
              id="capture-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="flex-1 px-3 py-2 bg-gray-50 border border-[var(--color-brand-concrete)] rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-[var(--color-brand-primary)]"
            >
              {categoryNames.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {kind === 'boq' && <BoqNotes notes={boqNotes} onChange={(n) => actions.setListNotes(draftIds.boq, n)} />}

          <button
            onClick={handleProcess}
            disabled={!inputText.trim() && images.length === 0}
            className="w-full h-12 bg-[var(--color-brand-primary)] text-white font-bold rounded-xl flex items-center justify-center gap-3 hover:brightness-110 active:scale-[0.98] transition-all disabled:grayscale disabled:opacity-50 shadow-lg shadow-orange-100"
          >
            <ClipboardCheck size={20} />
            <span className="text-base font-semibold">Read items</span>
          </button>
          {!inputText.trim() && images.length === 0 && <p className="text-xs text-gray-500 text-center -mt-2">Add a bill photo or type what {kind === 'audit' ? 'was bought' : 'you need'} first.</p>}

          {showJobs && jobs.length > 0 && (
            <JobList jobs={jobs} current={status.current} offline={!status.online} hasKey={!!settings.geminiApiKey || settings.readingMode !== 'gemini'} onRetry={actions.retryJob} onDelete={(j) => actions.deleteJob(j.id)} />
          )}
        </div>
      </div>
      {sourceMenu && <PhotoSourceSheet remaining={MAX_IMAGES - images.length} onPick={pickFrom} onClose={() => setSourceMenu(false)} />}
    </>
  );
}

/** Notes are edited locally and saved shortly after typing stops. */
function BoqNotes({ notes, onChange }: { notes: string; onChange(n: string): void }) {
  const [value, setValue] = useState(notes);
  const [lastSeen, setLastSeen] = useState(notes);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<string | null>(null);
  const save = useRef(onChange);
  save.current = onChange;
  // Don't lose the last keystrokes when switching tabs.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (pending.current !== null) save.current(pending.current);
    },
    [],
  );
  if (notes !== lastSeen) {
    // Updated elsewhere (restoring a backup or a saved session).
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
    <div className="space-y-2 pt-2">
      <div className="flex justify-between items-end">
        <label htmlFor="boq-notes" className="text-xs text-blue-500 font-bold">
          General Specifications
        </label>
        {value && (
          <button onClick={() => update('')} className="text-xs font-bold text-blue-400 hover:text-red-500 uppercase tracking-tighter">
            Clear All
          </button>
        )}
      </div>
      <textarea
        id="boq-notes"
        value={value}
        onChange={(e) => update(e.target.value)}
        placeholder="Enter color codes, finishes (glossy/matt), or specific brand requests here for the PDF..."
        className="w-full h-24 p-3 bg-blue-50/50 border border-blue-100 rounded-xl text-xs focus:ring-1 focus:ring-blue-400 outline-none transition-all resize-none"
      />
    </div>
  );
}

/** Entries being read (or waiting to be), for the list's kind. */
export function QueuedReadings({ kind }: { kind: ListKind }) {
  const { actions, status, settings, jobsFor } = useAppState();
  const jobs = jobsFor(kind);
  if (jobs.length === 0) return null;
  return (
    <JobList jobs={jobs} current={status.current} offline={!status.online} hasKey={!!settings.geminiApiKey || settings.readingMode !== 'gemini'} onRetry={actions.retryJob} onDelete={(j) => actions.deleteJob(j.id)} />
  );
}

/** Where an entry is being read (phone or Gemini), what step, and a bar; Gemini's bar follows the time taken. */
function ReadingBar({ current, photos }: { current: ReadingProgress; photos: number }) {
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
    <div className="mt-1 space-y-1" role="status" aria-live="polite">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${phone ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}
        >
          {phone ? <Smartphone size={10} /> : <Sparkles size={10} />} {phone ? 'On phone' : 'Gemini'}
        </span>
        <span className="text-gray-600">{current.step}</span>
        {!phone && <span className="text-gray-500 font-mono">{seconds}s</span>}
      </div>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
        <div className={`h-full transition-all duration-500 ${phone ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${Math.max(4, value * 100)}%` }} />
      </div>
      {!phone && current.model && <div className="text-xs text-gray-500 font-mono truncate">{current.model}</div>}
    </div>
  );
}

function JobList({
  jobs,
  current,
  offline,
  hasKey,
  onRetry,
  onDelete,
}: {
  jobs: Job[];
  current: ReadingProgress | null;
  offline: boolean;
  hasKey: boolean;
  onRetry(job: Job): void;
  onDelete(job: Job): void;
}) {
  const waitingReason = !hasKey ? 'Add your Gemini API key in Settings' : offline ? 'Will be read when online' : 'Queued';
  return (
    <div className="space-y-2">
      <div className="text-xs text-gray-500 font-semibold">Being read</div>
      {jobs.map((job) => {
        const label = job.text ? `“${job.text.slice(0, 60)}${job.text.length > 60 ? '…' : ''}”` : '';
        const photos = job.image_count ? `${job.image_count} photo${job.image_count > 1 ? 's' : ''}` : '';
        const reading = current?.jobId === job.id ? current : null;
        const busy = !!reading || job.status === 'processing';
        return (
          <div
            key={job.id}
            className={`p-3 rounded-xl border text-xs flex items-start gap-3
              ${job.status === 'failed' ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}
          >
            <div className="mt-0.5 shrink-0">
              {busy ? (
                <Loader2 size={14} className="animate-spin text-orange-500" />
              ) : job.status === 'failed' ? (
                <AlertTriangle size={14} className="text-red-500" />
              ) : (
                <CloudOff size={14} className="text-gray-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-gray-700 truncate">{[photos, label].filter(Boolean).join(' · ') || 'Entry'}</div>
              {reading ? (
                <ReadingBar current={reading} photos={job.image_count} />
              ) : (
                <div className={`text-xs ${job.status === 'failed' ? 'text-red-600' : 'text-gray-500'}`}>
                  {job.status === 'processing' ? 'Reading…' : job.status === 'failed' ? job.error : waitingReason}
                </div>
              )}
            </div>
            {!busy && (
              <div className="flex gap-1 shrink-0">
                {job.status === 'failed' && (
                  <button onClick={() => onRetry(job)} className="p-2.5 -m-1.5 text-gray-500 hover:text-orange-600" aria-label="Retry">
                    <RotateCcw size={14} />
                  </button>
                )}
                <button onClick={() => onDelete(job)} className="p-2.5 -m-1.5 text-gray-500 hover:text-red-500" aria-label="Remove from queue">
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
