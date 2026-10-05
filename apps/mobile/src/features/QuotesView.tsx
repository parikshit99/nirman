import { useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Camera, CheckCircle2, Image as ImageIcon, Loader2, Plus, RotateCcw, Trash2, Truck, X } from 'lucide-react';
import { MAX_IMAGES, compareQuotes, parseAmount, todayISO, variantLabel, type QuoteRow } from '@nirman/shared';
import { useDialogs } from '../components/Dialogs.tsx';
import { PhotoSourceSheet } from '../components/PhotoSourceSheet.tsx';
import { chooseFromGallery, takePhoto } from '../lib/camera.ts';
import type { IncomingShare } from '../lib/sharedFiles.ts';
import { compressImage, dataUrlToBase64, readFileAsDataUrl } from '../lib/images.ts';
import { isNative } from '../lib/platform.ts';
import { useAppState, type HistoryRecord } from '../state/AppState.tsx';
import { QuoteCompare } from './QuoteCompare.tsx';
import { QuoteReview } from './QuoteReview.tsx';
import { Sheet } from '../components/ui/Sheet.tsx';
import { Tabs } from '../components/ui/Tabs.tsx';
import { Button } from '../components/ui/Button.tsx';

type Screen = { name: 'list' | 'add' | 'compare' } | { name: 'review'; quoteId: string };

/** Vendor quotes for one saved BOQ: add, review the AI's matching, compare vendors and past prices. */
export function QuotesView({ boqId, initial, onClose }: { boqId: string; initial?: IncomingShare; onClose(): void }) {
  const { history, quotesFor } = useAppState();
  const boq = history.find((h) => h.id === boqId);
  const quotes = quotesFor(boqId);
  const confirmed = quotes.filter((q) => q.status === 'confirmed');
  const [screen, setScreen] = useState<Screen>(() =>
    quotes.length === 0 || initial ? { name: 'add' } : confirmed.length > 0 ? { name: 'compare' } : { name: 'list' },
  );
  // Shared photos fill in the first quote only.
  const [shared, setShared] = useState(initial);
  // Back steps out of a quote or the add form first, then closes.
  const stepBack = () => (screen.name === 'review' || screen.name === 'add' ? setScreen({ name: 'list' }) : onClose());
  if (!boq) return null;

  const reviewing = screen.name === 'review' ? quotes.find((q) => q.id === screen.quoteId) : undefined;
  const back = () => setScreen({ name: 'list' });

  return (
    <Sheet kind="screen" size="xl" tall scroll={false} labelledBy="quotes-title" onClose={onClose} onBack={stepBack}>
      <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center gap-3">
        {screen.name === 'review' || screen.name === 'add' ? (
          <button onClick={back} className="p-2.5 -m-1.5 text-gray-500 hover:text-black" aria-label="Back to quotes">
            <ArrowLeft size={20} />
          </button>
        ) : (
          <div className="p-2 bg-[var(--color-brand-primary)] text-white rounded-lg shrink-0">
            <Truck size={18} />
          </div>
        )}
        <div className="min-w-0 flex-1">
            <h3 id="quotes-title" className="text-sm font-bold truncate">Vendor quotes · {boq.title || 'Untitled BOQ'}</h3>
          <p className="text-xs text-gray-500 font-mono truncate">
            {boq.items.length} BOQ items{boq.address ? ` · ${boq.address}` : ''}
          </p>
        </div>
        <button onClick={onClose} className="p-2.5 -m-1.5 text-gray-500 hover:text-black" aria-label="Close">
          <X size={22} />
        </button>
      </div>

      {(screen.name === 'list' || screen.name === 'compare') && (
        <Tabs
          label="Quote views"
          className="m-2"
          value={screen.name}
          onChange={(name) => setScreen({ name })}
          options={[
            { id: 'compare', label: `Compare (${confirmed.length})` },
            { id: 'list', label: `Quotes (${quotes.length})` },
          ]}
        />
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {screen.name === 'add' && (
          <AddQuote
            boqId={boqId}
            initial={shared}
            onDone={(reviewQuoteId) => {
              setShared(undefined);
              // A typed quote opens straight in review, to check and confirm.
              if (reviewQuoteId) setScreen({ name: 'review', quoteId: reviewQuoteId });
              else back();
            }}
          />
        )}
        {screen.name === 'list' && <QuoteList boq={boq} quotes={quotes} onAdd={() => setScreen({ name: 'add' })} onOpen={(q) => setScreen({ name: 'review', quoteId: q.id })} />}
        {screen.name === 'review' && (reviewing ? <QuoteReview boq={boq} quote={reviewing} onDone={() => setScreen({ name: 'compare' })} /> : <p className="text-xs text-gray-500">This quote was deleted.</p>)}
        {screen.name === 'compare' && <QuoteCompare boq={boq} quotes={confirmed} onAdd={() => setScreen({ name: 'add' })} />}
      </div>
    </Sheet>
  );
}

function QuoteList({ boq, quotes, onAdd, onOpen }: { boq: HistoryRecord; quotes: QuoteRow[]; onAdd(): void; onOpen(q: QuoteRow): void }) {
  const { linesFor, jobForQuote, itemDatabase, learning, status, settings, actions } = useAppState();
  const dialogs = useDialogs();

  const remove = async (q: QuoteRow) => {
    const ok = await dialogs.confirm(`Delete ${q.vendor}'s quote?`, {
      message: q.status === 'confirmed' ? 'Prices already added to the material database stay there; remove them from the Rates tab if needed.' : undefined,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) await actions.deleteQuote(q.id);
  };

  return (
    <div className="space-y-3">
      <button
        onClick={onAdd}
        className="w-full py-3 bg-[var(--color-brand-primary)] text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2"
      >
        <Plus size={14} /> Add vendor quote
      </button>
      {quotes.length === 0 && <p className="text-xs text-gray-500 text-center p-6">No quotes yet for this BOQ.</p>}
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
                <div className="text-xs font-mono text-gray-500">{new Date(q.quote_date).toLocaleDateString('en-IN')}</div>
              </div>
              <button onClick={() => remove(q)} className="p-2.5 -m-1.5 text-gray-500 hover:text-red-500" aria-label={`Delete ${q.vendor}'s quote`}>
                <Trash2 size={16} />
              </button>
            </div>
            <div className="text-xs mt-2">{state}</div>
            <div className="flex gap-2 mt-3">
              {job?.status === 'failed' && (
                <button onClick={() => actions.retryJob(job)} className="flex-1 py-2 bg-gray-100 rounded-lg text-xs font-bold uppercase flex items-center justify-center gap-1">
                  <RotateCcw size={12} /> Retry
                </button>
              )}
              {!job && lines.length > 0 && (
                <Button variant="primary" size="sm" className="flex-1" onClick={() => onOpen(q)}>
                  {q.status === 'confirmed' ? 'View lines' : 'Review & confirm'}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AddQuote({ boqId, initial, onDone }: { boqId: string; initial?: IncomingShare; onDone(reviewQuoteId?: string): void }) {
  const { actions, knownVendors, history } = useAppState();
  const dialogs = useDialogs();
  const [vendor, setVendor] = useState('');
  const [date, setDate] = useState(todayISO());
  const [text, setText] = useState(initial?.text ?? '');
  const [images, setImages] = useState<string[]>(initial?.images.slice(0, MAX_IMAGES) ?? []);
  const [sourceMenu, setSourceMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Typing the vendor's rates against each BOQ line needs no AI or internet.
  const [mode, setMode] = useState<'read' | 'type'>('read');
  const boqItems = history.find((h) => h.id === boqId)?.items ?? [];
  const [rates, setRates] = useState<Record<string, string>>({});
  const typed = boqItems.map((i) => ({ boqItemId: i.id, unitPrice: parseAmount(rates[i.id] ?? '') ?? NaN })).filter((r) => r.unitPrice > 0);
  const badRate = boqItems.some((i) => (rates[i.id] ?? '').trim() && !(Number(parseAmount(rates[i.id])) >= 0));
  const submitTyped = async () => {
    setBusy(true);
    try {
      const id = await actions.createManualQuote({ boqId, vendor, quoteDate: date || todayISO(), rates: typed });
      onDone(id);
    } finally {
      setBusy(false);
    }
  };

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
      <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-xl" role="tablist" aria-label="How to add the quote">
        {(['read', 'type'] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`py-2 rounded-lg text-xs font-bold uppercase tracking-wider ${mode === m ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
          >
            {m === 'read' ? 'Photo / text (AI)' : 'Type rates'}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">
        {mode === 'read'
          ? "Photograph the vendor's reply as it is, even if they wrote their own list. The AI matches each line to this BOQ, and you check the matches before anything is saved."
          : "Enter the vendor's rate against each BOQ line; leave blank what they didn't quote. Works without internet or an API key."}
      </p>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Vendor</span>
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
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Quote date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none" />
        </label>
      </div>

      {mode === 'type' ? (
        <>
          <ul className="divide-y divide-gray-100 border border-gray-200 rounded-xl">
            {boqItems.map((item, i) => (
              <li key={item.id} className="flex items-center gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">
                    {i + 1}. {item.item_name}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {[variantLabel(item), `${item.quantity} ${item.unit}`].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <label className="flex items-center gap-1 shrink-0">
                  <span className="text-xs text-gray-500">₹</span>
                  <input
                    inputMode="decimal"
                    aria-label={`Rate for ${item.item_name}`}
                    value={rates[item.id] ?? ''}
                    onChange={(e) => setRates((r) => ({ ...r, [item.id]: e.target.value }))}
                    placeholder={`per ${item.unit}`}
                    className="w-24 px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </label>
              </li>
            ))}
          </ul>
          <button
            onClick={submitTyped}
            disabled={!vendor.trim() || typed.length === 0 || badRate || busy}
            className="w-full h-12 bg-[var(--color-brand-primary)] text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 uppercase tracking-wider text-xs"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Review {typed.length} {typed.length === 1 ? 'rate' : 'rates'}
          </button>
          {badRate && <p className="text-xs text-red-600 text-center">Use digits for rates, e.g. 380 or 1,500.</p>}
        </>
      ) : (
        <>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Photos of the quote</span>
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
                  className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 text-gray-500 hover:border-gray-500"
                >
                  {isNative ? <Camera size={20} /> : <ImageIcon size={20} />}
                  <span className="text-xs font-bold uppercase">Add page</span>
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
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Or type / paste the quote (optional)</span>
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
            className="w-full h-12 bg-[var(--color-brand-primary)] text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 uppercase tracking-wider text-xs"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Read quote
          </button>
        </>
      )}
      {!vendor.trim() && <p className="text-xs text-gray-500 text-center">Enter the vendor's name to continue.</p>}
      {sourceMenu && <PhotoSourceSheet remaining={MAX_IMAGES - images.length} onPick={pickFrom} onClose={() => setSourceMenu(false)} />}
    </div>
  );
}

