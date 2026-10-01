import { useEffect, useRef, useState } from 'react';
import { MAX_IMAGES, todayISO } from '@nirman/shared';
import {
  AlertTriangle,
  Camera,
  ClipboardCheck,
  CloudOff,
  Database,
  Image as ImageIcon,
  Loader2,
  Mic,
  MicOff,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { useDialogs } from '../components/Dialogs.tsx';
import { DRAFT_IDS, type Job, type ListKind } from '../data/repo.ts';
import { capturePhoto } from '../lib/camera.ts';
import { compressImage, dataUrlToBase64, readFileAsDataUrl } from '../lib/images.ts';
import { isNative } from '../lib/platform.ts';
import { startDictation, type SpeechLanguage } from '../lib/speech.ts';
import { useAppState } from '../state/AppState.tsx';

export function CapturePanel({ kind }: { kind: ListKind }) {
  const { actions, status, settings, boqNotes, learningCount, categoryNames, jobsFor } = useAppState();
  const dialogs = useDialogs();
  const [inputText, setInputText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [category, setCategory] = useState(categoryNames[0] ?? 'Civil');
  const [listening, setListening] = useState(false);
  const [language, setLanguage] = useState<SpeechLanguage>('en-IN');
  const stopDictation = useRef<(() => void) | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jobs = jobsFor(kind);

  const addImages = async (dataUrls: Promise<string | null>[]) => {
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
    if (!isNative) {
      fileInputRef.current?.click();
      return;
    }
    try {
      await addImages([capturePhoto()]);
    } catch (err) {
      await dialogs.alert('Could not open the camera', (err as Error).message);
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
      listId: DRAFT_IDS[kind],
      text: inputText.trim(),
      images: images.map(dataUrlToBase64),
      category,
      captureDate: todayISO(),
    });
    setInputText('');
    setImages([]);
  };

  const resetLearning = async () => {
    const ok = await dialogs.confirm(`Forget ${learningCount} learned corrections?`, {
      message: 'The AI will go back to its default interpretation of these terms.',
      confirmLabel: 'Reset',
      danger: true,
    });
    if (ok) await actions.clearLearning();
  };

  return (
    <>
      <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-3">
        <Database size={18} className="text-blue-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-bold text-blue-900 mb-1">Works offline</p>
          <p className="text-[10px] text-blue-700 leading-normal">
            {kind === 'audit'
              ? 'Records are stored only on this phone and work offline. Notes and photos are sent to Google Gemini to be read; offline entries wait until you are online.'
              : 'Create a list for price quotation. Rate and total are left blank for vendor quotes.'}
          </p>
          {learningCount > 0 && (
            <button onClick={resetLearning} className="mt-2 text-[8px] font-bold text-blue-500 uppercase hover:underline">
              Reset {learningCount} Learned Patterns
            </button>
          )}
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-xs font-mono uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
          <Plus size={12} /> New {kind === 'audit' ? 'Audit' : 'BOQ'} Entry
        </h2>

        <div className="space-y-4">
          <div
            className={`relative border-2 border-dashed rounded-xl transition-all min-h-[12rem] flex flex-col items-center justify-center gap-4 p-4
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
                      className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-gray-500 hover:text-gray-500 transition-all bg-white/50"
                    >
                      <Plus size={20} />
                      <span className="text-[8px] font-bold uppercase">Add More</span>
                    </button>
                  )}
                </div>
                <p className="text-center text-[10px] font-mono text-orange-600 font-bold uppercase tracking-widest leading-none">
                  {images.length}/{MAX_IMAGES} Images Added
                </p>
              </div>
            ) : (
              <button className="text-center" onClick={addPhoto}>
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mx-auto mb-2">
                  {isNative ? <Camera size={24} /> : <ImageIcon size={24} />}
                </div>
                <p className="text-sm font-medium text-gray-600">{isNative ? 'Take or Choose Photos' : 'Drop Bills or Choose Photos'}</p>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-mono">Up to {MAX_IMAGES} images for one entry</p>
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
              <label htmlFor="capture-text" className="text-[11px] font-mono uppercase tracking-wider text-gray-500 font-bold">
                Input Details
              </label>
              <div className="flex gap-2">
                {inputText && (
                  <button
                    onClick={() => setInputText('')}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase bg-gray-100 text-gray-400 hover:text-red-500"
                  >
                    <X size={10} /> Clear
                  </button>
                )}
                <button
                  onClick={() => setLanguage((l) => (l === 'en-IN' ? 'hi-IN' : 'en-IN'))}
                  disabled={listening}
                  className="px-2 py-1 rounded-md text-[10px] font-bold uppercase bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-50"
                  title="Voice input language"
                >
                  {language === 'en-IN' ? 'EN' : 'हिं'}
                </button>
                <button
                  onClick={toggleListening}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase transition-all
                    ${listening ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >
                  {listening ? <MicOff size={10} /> : <Mic size={10} />}
                  {listening ? 'Stop' : 'Voice Input'}
                </button>
              </div>
            </div>
            <textarea
              id="capture-text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={kind === 'audit' ? "Example: '15 bori cement bought for 7500'" : "Example: 'Item: Brickwork, Quantity: 500 sqft, Rate: 45'"}
              className="w-full h-32 p-4 bg-gray-50 border border-[var(--color-brand-concrete)] rounded-xl text-sm focus:ring-1 focus:ring-[var(--color-brand-primary)] focus:border-[var(--color-brand-primary)] outline-none transition-all resize-none font-mono"
            />
          </div>

          <div className="flex items-center gap-3">
            <label htmlFor="capture-category" className="text-[11px] font-mono uppercase tracking-wider text-gray-500 font-bold shrink-0">
              Work Type
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

          {kind === 'boq' && <BoqNotes notes={boqNotes} onChange={(n) => actions.setListNotes(DRAFT_IDS.boq, n)} />}

          <button
            onClick={handleProcess}
            disabled={!inputText.trim() && images.length === 0}
            className="w-full h-12 bg-[var(--color-brand-primary)] text-white font-bold rounded-xl flex items-center justify-center gap-3 hover:brightness-110 active:scale-[0.98] transition-all disabled:grayscale disabled:opacity-50 shadow-lg shadow-orange-100"
          >
            <ClipboardCheck size={20} />
            <span className="uppercase tracking-widest text-[16px]">AI Extraction</span>
          </button>

          {jobs.length > 0 && (
            <JobList jobs={jobs} offline={!status.online} hasKey={!!settings.geminiApiKey} onRetry={actions.retryJob} onDelete={(j) => actions.deleteJob(j.id)} />
          )}
        </div>
      </div>
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
        <label htmlFor="boq-notes" className="text-[11px] font-mono uppercase tracking-wider text-blue-500 font-bold">
          General Specifications
        </label>
        {value && (
          <button onClick={() => update('')} className="text-[9px] font-bold text-blue-400 hover:text-red-500 uppercase tracking-tighter">
            Clear All
          </button>
        )}
      </div>
      <textarea
        id="boq-notes"
        value={value}
        onChange={(e) => update(e.target.value)}
        placeholder="Enter color codes, finishes (glossy/matt), or specific brand requests here for the PDF..."
        className="w-full h-24 p-3 bg-blue-50/50 border border-blue-100 rounded-xl text-[11px] focus:ring-1 focus:ring-blue-400 outline-none transition-all resize-none"
      />
    </div>
  );
}

function JobList({
  jobs,
  offline,
  hasKey,
  onRetry,
  onDelete,
}: {
  jobs: Job[];
  offline: boolean;
  hasKey: boolean;
  onRetry(job: Job): void;
  onDelete(job: Job): void;
}) {
  const waitingReason = !hasKey ? 'Add your Gemini API key in Settings' : offline ? 'Will be read when online' : 'Queued';
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-mono uppercase tracking-widest text-gray-400">Extraction Queue</div>
      {jobs.map((job) => {
        const label = job.text ? `“${job.text.slice(0, 60)}${job.text.length > 60 ? '…' : ''}”` : '';
        const photos = job.image_count ? `${job.image_count} photo${job.image_count > 1 ? 's' : ''}` : '';
        return (
          <div
            key={job.id}
            className={`p-3 rounded-xl border text-[11px] flex items-start gap-3
              ${job.status === 'failed' ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}
          >
            <div className="mt-0.5 shrink-0">
              {job.status === 'processing' ? (
                <Loader2 size={14} className="animate-spin text-orange-500" />
              ) : job.status === 'failed' ? (
                <AlertTriangle size={14} className="text-red-500" />
              ) : (
                <CloudOff size={14} className="text-gray-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-gray-700 truncate">{[photos, label].filter(Boolean).join(' · ') || 'Entry'}</div>
              <div className={`text-[10px] ${job.status === 'failed' ? 'text-red-600' : 'text-gray-500'}`}>
                {job.status === 'processing' ? 'Reading with AI…' : job.status === 'failed' ? job.error : waitingReason}
              </div>
            </div>
            {job.status !== 'processing' && (
              <div className="flex gap-1 shrink-0">
                {job.status === 'failed' && (
                  <button onClick={() => onRetry(job)} className="p-1.5 text-gray-500 hover:text-orange-600" aria-label="Retry">
                    <RotateCcw size={14} />
                  </button>
                )}
                <button onClick={() => onDelete(job)} className="p-1.5 text-gray-400 hover:text-red-500" aria-label="Remove from queue">
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
