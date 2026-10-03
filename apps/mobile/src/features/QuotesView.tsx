import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, ArrowLeft, Camera, CheckCircle2, Image as ImageIcon, Loader2, Plus, RotateCcw, Trash2, Truck, X } from 'lucide-react';
import { MAX_IMAGES, compareQuotes, todayISO, type QuoteRow } from '@nirman/shared';
import { useDialogs } from '../components/Dialogs.tsx';
import { PhotoSourceSheet } from '../components/PhotoSourceSheet.tsx';
import { chooseFromGallery, takePhoto } from '../lib/camera.ts';
import { compressImage, dataUrlToBase64, readFileAsDataUrl } from '../lib/images.ts';
import { isNative } from '../lib/platform.ts';
import { useAppState, type HistoryRecord } from '../state/AppState.tsx';
import { QuoteCompare } from './QuoteCompare.tsx';
import { QuoteReview } from './QuoteReview.tsx';
import { useBackHandler } from '../lib/backButton.ts';

type Screen = { name: 'list' | 'add' | 'compare' } | { name: 'review'; quoteId: string };

/** Vendor quotes for one saved BOQ: add, review the AI's matching, compare vendors and past prices. */
export function QuotesView({ boqId, onClose }: { boqId: string; onClose(): void }) {
  const { history, quotesFor } = useAppState();
  const boq = history.find((h) => h.id === boqId);
  const quotes = quotesFor(boqId);
  const confirmed = quotes.filter((q) => q.status === 'confirmed');
  const [screen, setScreen] = useState<Screen>(() =>
    quotes.length === 0 ? { name: 'add' } : confirmed.length > 0 ? { name: 'compare' } : { name: 'list' },
  );
  // Back steps out of a quote or the add form first, then closes.
  useBackHandler(() => (screen.name === 'review' || screen.name === 'add' ? setScreen({ name: 'list' }) : onClose()));
  if (!boq) return null;

  const reviewing = screen.name === 'review' ? quotes.find((q) => q.id === screen.quoteId) : undefined;
  const back = () => setScreen({ name: 'list' });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-stretch md:items-center justify-center md:p-4 bg-black/70 backdrop-blur-sm"
    >
      <div role="dialog" aria-modal="true" aria-labelledby="quotes-title" className="bg-white w-full max-w-5xl h-full md:h-[90vh] md:rounded-2xl flex flex-col shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center gap-3">
          {screen.name === 'review' || screen.name === 'add' ? (
            <button onClick={back} className="p-1 text-gray-500 hover:text-black" aria-label="Back to quotes">
              <ArrowLeft size={20} />
            </button>
          ) : (
            <div className="p-2 bg-[var(--color-brand-primary)] text-white rounded-lg shrink-0">
              <Truck size={18} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 id="quotes-title" className="text-sm font-bold truncate">Vendor quotes · {boq.title || 'Untitled BOQ'}</h3>
            <p className="text-[10px] text-gray-500 font-mono truncate">
              {boq.items.length} BOQ items{boq.address ? ` · ${boq.address}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-black" aria-label="Close">
            <X size={22} />
          </button>
        </div>

        {(screen.name === 'list' || screen.name === 'compare') && (
          <nav className="flex gap-1 p-2 border-b border-gray-100" aria-label="Quote views">
            {(['compare', 'list'] as const).map((name) => (
              <button
                key={name}
                onClick={() => setScreen({ name })}
                aria-current={screen.name === name ? 'page' : undefined}
                className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider ${screen.name === name ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
              >
                {name === 'compare' ? `Compare (${confirmed.length})` : `Quotes (${quotes.length})`}
              </button>
            ))}
          </nav>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {screen.name === 'add' && <AddQuote boqId={boqId} onDone={back} />}
          {screen.name === 'list' && <QuoteList boq={boq} quotes={quotes} onAdd={() => setScreen({ name: 'add' })} onOpen={(q) => setScreen({ name: 'review', quoteId: q.id })} />}
          {screen.name === 'review' && (reviewing ? <QuoteReview boq={boq} quote={reviewing} onDone={() => setScreen({ name: 'compare' })} /> : <p className="text-xs text-gray-500">This quote was deleted.</p>)}
          {screen.name === 'compare' && <QuoteCompare boq={boq} quotes={confirmed} onAdd={() => setScreen({ name: 'add' })} />}
        </div>
      </div>
    </motion.div>
  );
}

function QuoteList({ boq, quotes, onAdd, onOpen }: { boq: HistoryRecord; quotes: QuoteRow[]; onAdd(): void; onOpen(q: QuoteRow): void }) {
  const { linesFor, jobForQuote, itemDatabase, learning, status, settings, actions } = useAppState();
  const dialogs = useDialogs();

  const remove = async (q: QuoteRow) => {
    const ok = await dialogs.confirm(`Delete ${q.vendor}'s quote?`, {
      message: q.status === 'confirmed' ? 'Prices already added to the material database stay there; remove them from the Data tab if needed.' : undefined,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) await actions.deleteQuote(q.id);
  };

  return (
    <div className="space-y-3">
      <button
        onClick={onAdd}
        className="w-full py-3 bg-[var(--color-brand-primary)] text-white rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2"
      >
        <Plus size={14} /> Add vendor quote
      </button>
      {quotes.length === 0 && <p className="text-xs text-gray-400 text-center p-6">No quotes yet for this BOQ.</p>}
      {quotes.map((q) => {
        const job = jobForQuote(q.id);
        const lines = linesFor(q.id);
        const summary = compareQuotes(boq.items, [q], lines, itemDatabase, learning).vendors[0];
        let state: React.ReactNode;
        if (job?.status === 'failed') {
          state = (
            <span className="text-red-600 flex items-start gap-1">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {job.error}
            </span>
          );
        } else if (job) {
          const waiting = !status.online ? 'Waiting for internet' : !settings.geminiApiKey ? 'Add your Gemini key in Settings' : 'Reading…';
          state = (
            <span className="text-orange-600 flex items-center gap-1">
              <Loader2 size={12} className={waiting === 'Reading…' ? 'animate-spin' : ''} /> {waiting}
            </span>
          );
        } else if (lines.length === 0) {
          state = <span className="text-gray-500">Nothing was read. Delete it and add the quote again.</span>;
        } else {
          state = (
            <span className={q.status === 'confirmed' ? 'text-green-700' : 'text-blue-700'}>
              {q.status === 'confirmed' ? 'Confirmed' : 'Needs review'} · {summary.quoted} of {boq.items.length} quoted
              {summary.missing.length > 0 && <b className="text-red-600"> · {summary.missing.length} missing</b>}
              {summary.extras.length > 0 && ` · ${summary.extras.length} extra`}
            </span>
          );
        }
        return (
          <div key={q.id} className="p-4 border border-gray-200 rounded-xl">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <div className="font-bold text-sm text-gray-900 truncate">{q.vendor || 'Unnamed vendor'}</div>
                <div className="text-[10px] font-mono text-gray-400">{new Date(q.quote_date).toLocaleDateString('en-IN')}</div>
              </div>
              <button onClick={() => remove(q)} className="p-1.5 text-gray-300 hover:text-red-500" aria-label={`Delete ${q.vendor}'s quote`}>
                <Trash2 size={16} />
              </button>
            </div>
            <div className="text-[11px] mt-2">{state}</div>
            <div className="flex gap-2 mt-3">
              {job?.status === 'failed' && (
                <button onClick={() => actions.retryJob(job)} className="flex-1 py-2 bg-gray-100 rounded-lg text-[10px] font-bold uppercase flex items-center justify-center gap-1">
                  <RotateCcw size={12} /> Retry
                </button>
              )}
              {!job && lines.length > 0 && (
                <button onClick={() => onOpen(q)} className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider">
                  {q.status === 'confirmed' ? 'View lines' : 'Review & confirm'}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AddQuote({ boqId, onDone }: { boqId: string; onDone(): void }) {
  const { actions, knownVendors } = useAppState();
  const dialogs = useDialogs();
  const [vendor, setVendor] = useState('');
  const [date, setDate] = useState(todayISO());
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [sourceMenu, setSourceMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addImages = async (urls: (string | Promise<string | null>)[]) => {
    const results = (await Promise.all(urls)).filter((x): x is string => !!x);
    setImages((prev) => [...prev, ...results].slice(0, MAX_IMAGES));
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
  const addPhoto = () => (isNative ? setSourceMenu(true) : fileRef.current?.click());

  const submit = async () => {
    setBusy(true);
    try {
      await actions.enqueueQuote({ boqId, vendor, quoteDate: date || todayISO(), text: text.trim(), images: images.map(dataUrlToBase64) });
      onDone();
    } finally {
      setBusy(false);
    }
  };
  const ready = vendor.trim() && (images.length > 0 || text.trim());

  return (
    <div className="space-y-4 max-w-xl mx-auto">
      <p className="text-[11px] text-gray-500 leading-relaxed">
        Photograph the vendor's reply as it is, even if they wrote their own list. The AI matches each line to this BOQ, and you check the matches before
        anything is saved.
      </p>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Vendor</span>
          <input
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            list="known-vendors"
            placeholder="e.g. Sharma Traders"
            className="mt-1 w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500"
          />
          <datalist id="known-vendors">
            {knownVendors.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Quote date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none" />
        </label>
      </div>

      <div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Photos of the quote</span>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {images.map((src, idx) => (
            <div key={idx} className="relative aspect-square rounded-lg border border-gray-200 overflow-hidden">
              <img src={src} alt={`Page ${idx + 1}`} className="w-full h-full object-cover" />
              <button
                onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                className="absolute top-1 right-1 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center"
                aria-label={`Remove page ${idx + 1}`}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {images.length < MAX_IMAGES && (
            <button
              onClick={addPhoto}
              className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-gray-500"
            >
              {isNative ? <Camera size={20} /> : <ImageIcon size={20} />}
              <span className="text-[9px] font-bold uppercase">Add page</span>
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          aria-label="Quote photos"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/')).slice(0, MAX_IMAGES - images.length);
            e.target.value = '';
            void addImages(files.map(async (f) => compressImage(await readFileAsDataUrl(f))));
          }}
        />
      </div>

      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Or type / paste the quote (optional)</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="e.g. cement ACC 380 per bag, reti 1400 per ton…"
          className="mt-1 w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500"
        />
      </label>

      <button
        onClick={submit}
        disabled={!ready || busy}
        className="w-full h-12 bg-[var(--color-brand-primary)] text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 uppercase tracking-widest text-xs"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Read quote
      </button>
      {!vendor.trim() && <p className="text-[10px] text-gray-400 text-center">Enter the vendor's name to continue.</p>}
      {sourceMenu && <PhotoSourceSheet remaining={MAX_IMAGES - images.length} onPick={pickFrom} onClose={() => setSourceMenu(false)} />}
    </div>
  );
}

