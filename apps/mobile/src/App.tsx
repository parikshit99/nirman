import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Database, Eye, FileCode, FileText, HardHat, History, LayoutDashboard, Save, Share2, ShoppingCart, Search, Trash2 } from 'lucide-react';
import Fuse from 'fuse.js';
import { filterMaterials, guessCategory, todayISO, type MaterialFilter } from '@nirman/shared';
import { useDialogs } from './components/Dialogs.tsx';
import { useBackHandler } from './lib/backButton.ts';
import { prefs } from './lib/prefs.ts';
import { backupOverdue, describeLastBackup, snoozeBackupReminder } from './lib/backupReminder.ts';
import { PdfPreviewModal } from './components/PdfPreviewModal.tsx';
import { BoqPicker } from './features/BoqPicker.tsx';
import { QuotesView } from './features/QuotesView.tsx';
import { SaveModal } from './components/SaveModal.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { StatusChip } from './components/StatusChip.tsx';
import type { ListKind, ListMeta } from './data/repo.ts';
import { CapturePanel } from './features/CapturePanel.tsx';
import { DatabaseView } from './features/DatabaseView.tsx';
import { HistorySidebar, HistoryView } from './features/HistoryView.tsx';
import { DeliveriesSheet } from './features/DeliveriesSheet.tsx';
import { SiteReport } from './features/SiteReport.tsx';
import { ItemLog } from './features/ItemLog.tsx';
import { buildPdf } from './lib/pdf.ts';
import { listSheet, pdfFile, pdfToJpegs, sheetToXlsx, type ExportFormat } from './lib/exports.ts';
import { shareFiles } from './lib/files.ts';
import { ShareSheet } from './components/ShareSheet.tsx';
import { ShareTargetSheet, type ShareTarget } from './components/ShareTargetSheet.tsx';
import { onIncomingShare, type IncomingShare } from './lib/sharedFiles.ts';
import { useAppState, type HistoryRecord } from './state/AppState.tsx';

type AppTab = 'auditor' | 'boq' | 'history' | 'database';

/** `about` is the one line shown under the tabs saying what the open tab does. */
const TABS: { id: AppTab; label: string; icon: typeof LayoutDashboard; about: string }[] = [
  { id: 'auditor', label: 'Spend', icon: ShoppingCart, about: 'Photograph bills or type what was bought; get a spending log with the rate paid for each item.' },
  { id: 'boq', label: 'BOQ', icon: FileCode, about: 'Photograph a drawing or list; get a blank BOQ (no rates) to send vendors, then compare their quotes.' },
  { id: 'database', label: 'Data', icon: Database, about: 'Every price you have recorded, per material, to see how rates change over time.' },
  { id: 'history', label: 'History', icon: History, about: 'Saved purchase lists and BOQs. Open one to edit it, export it, or add vendor quotes.' },
];

interface SaveState {
  /** Record being edited, if any. */
  recordId?: string;
  /** Draft whose items are saved; absent when only editing a record's details. */
  kind?: ListKind;
  initial: ListMeta;
  titlePrefix: string;
}

const kindOf = (tab: AppTab): ListKind | null => (tab === 'auditor' ? 'audit' : tab === 'boq' ? 'boq' : null);

export default function App() {
  const state = useAppState();
  const { actions, history, itemDatabase, itemsFor, boqNotes, categoryNames, uniqueAddresses, settings, pendingDeletes, savedBoqs } = state;
  const dialogs = useDialogs();

  const [activeTab, setActiveTab] = useState<AppTab>('auditor');
  // On another tab, back returns to the Purchases tab before leaving the app.
  useBackHandler(() => setActiveTab('auditor'), activeTab !== 'auditor');
  /** Vendor quotes screen: a saved BOQ's id, or 'pick' to choose the BOQ first. */
  const [quoteTarget, setQuoteTarget] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [addressFilter, setAddressFilter] = useState('All');
  const [materialFilter, setMaterialFilter] = useState<MaterialFilter>({});
  const [linkedRecord, setLinkedRecord] = useState<Record<ListKind, string | null>>(() =>
    prefs.get('nirmaan_linked_records', { audit: null, boq: null }),
  );
  const [saveState, setSaveState] = useState<SaveState | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(() => !settings.geminiApiKey && !prefs.get('nirmaan_onboarded', false));
  const [firstRun, setFirstRun] = useState(settingsOpen);

  // Re-checked after Settings closes (a backup may have been made) or the reminder is snoozed.
  const [reminderTick, setReminderTick] = useState(0);
  const hasData = history.length > 0 || state.snapshot.items.length > 0;
  const showBackupReminder = useMemo(() => backupOverdue(hasData), [hasData, reminderTick]);

  const kind = kindOf(activeTab);
  /** The draft as listed (rows waiting for undo still show, struck through). */
  const listedItems = kind ? itemsFor(kind) : [];
  /** The draft as it counts: totals, PDF and saving leave out deleted rows. */
  const activeItems = useMemo(() => listedItems.filter((i) => !pendingDeletes.has(i.id)), [listedItems, pendingDeletes]);
  // Switching tabs carries out deletes still waiting for undo.
  useEffect(() => {
    void actions.flushDeletes();
  }, [activeTab, actions]);

  const linkRecord = (k: ListKind, id: string | null) => {
    setLinkedRecord((prev) => {
      const next = { ...prev, [k]: id };
      prefs.set('nirmaan_linked_records', next);
      return next;
    });
  };

  const search = searchQuery.trim();
  const filteredItems = useMemo(() => {
    if (!search) return listedItems;
    return new Fuse(listedItems, { keys: ['item_name', 'vendor', 'original_term', 'brand', 'model', 'spec', 'color'], threshold: 0.4 }).search(search).map((r) => r.item);
  }, [listedItems, search]);

  const matchesFilters = (category: string[], address: string[]) =>
    (categoryFilter === 'All' || category.some((c) => c.toLowerCase() === categoryFilter.toLowerCase())) &&
    (addressFilter === 'All' || address.includes(addressFilter));

  const filteredHistory = useMemo(() => {
    const base = search ? new Fuse(history, { keys: ['title', 'address', 'category'], threshold: 0.4 }).search(search).map((r) => r.item) : history;
    return base.filter((r) => matchesFilters([r.category], [r.address]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, search, categoryFilter, addressFilter]);

  const filteredDatabase = useMemo(() => {
    const base = search ? new Fuse(itemDatabase, { keys: ['name', 'variants.label'], threshold: 0.4 }).search(search).map((r) => r.item) : itemDatabase;
    return filterMaterials(base, materialFilter).filter((e) => matchesFilters(e.categories, e.addresses));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemDatabase, search, categoryFilter, addressFilter, materialFilter]);

  const totalSpent = kind === 'audit' ? filteredItems.reduce((acc, i) => acc + (pendingDeletes.has(i.id) ? 0 : i.total_amount || 0), 0) : 0;
  const titlePrefix = (k: ListKind) => (k === 'audit' ? 'Purchases' : 'BOQ');

  const openSave = () => {
    if (!kind || activeItems.length === 0) return;
    const record = history.find((r) => r.id === linkedRecord[kind]);
    setSaveState({
      kind,
      recordId: record?.id,
      titlePrefix: titlePrefix(kind),
      initial: {
        title: record?.title ?? '',
        address: record?.address ?? '',
        category: record?.category || guessCategory(activeItems),
        site_date: todayISO(),
      },
    });
  };

  const editRecordDetails = (record: HistoryRecord) =>
    setSaveState({
      recordId: record.id,
      titlePrefix: titlePrefix(record.kind),
      initial: {
        title: record.title,
        address: record.address,
        category: record.category || 'Civil',
        site_date: record.site_date || record.created_at.slice(0, 10),
      },
    });

  const handleSave = async (meta: ListMeta, asNew: boolean) => {
    if (!saveState) return;
    await actions.flushDeletes();
    const { kind: k, recordId } = saveState;
    setSaveState(null);
    if (!k) {
      if (recordId) await actions.updateListMeta(recordId, meta);
      return;
    }
    const id = await actions.saveDraftToHistory(k, meta, asNew ? undefined : recordId);
    if (!asNew) linkRecord(k, id);
  };

  const openRecord = async (record: HistoryRecord) => {
    await actions.flushDeletes();
    if (itemsFor(record.kind).length > 0) {
      const ok = await dialogs.confirm(`Replace the current ${titlePrefix(record.kind)} draft?`, {
        message: `The draft will be replaced with the ${record.items.length} items from “${record.title}”.`,
        confirmLabel: 'Replace',
      });
      if (!ok) return;
    }
    await actions.restoreToDraft(record.id);
    linkRecord(record.kind, record.id);
    setActiveTab(record.kind === 'audit' ? 'auditor' : 'boq');
  };

  const clearCurrent = async () => {
    if (kind) {
      const ok = await dialogs.confirm(`Clear the ${titlePrefix(kind)} draft?`, {
        message: `All ${activeItems.length} items in the current draft will be removed. Saved history is not affected.`,
        confirmLabel: 'Clear',
        danger: true,
      });
      if (!ok) return;
      await actions.clearListItems(kind === 'audit' ? 'draft-audit' : 'draft-boq');
      linkRecord(kind, null);
    } else if (activeTab === 'history') {
      const ok = await dialogs.confirm('Delete all saved sessions?', {
        message: `${history.length} sessions will be permanently deleted from this phone.`,
        confirmLabel: 'Delete all',
        danger: true,
      });
      if (ok) await actions.deleteAllHistory();
    }
  };

  const [shareOpen, setShareOpen] = useState(false);
  const [siteReportOpen, setSiteReportOpen] = useState(false);
  const [deliveriesFor, setDeliveriesFor] = useState<string | null>(null);

  // Photos or text shared from another app: first ask where they go, then hand them to that entry form.
  const [incoming, setIncoming] = useState<IncomingShare | null>(null);
  const [captureShare, setCaptureShare] = useState<{ kind: ListKind; share: IncomingShare } | null>(null);
  const [quoteShare, setQuoteShare] = useState<IncomingShare | undefined>(undefined);
  useEffect(() => onIncomingShare(setIncoming), []);
  const routeShare = (target: ShareTarget) => {
    if (!incoming) return;
    if (target === 'quote') {
      setQuoteShare(incoming);
      setQuoteTarget('pick');
    } else {
      setActiveTab(target === 'audit' ? 'auditor' : 'boq');
      setCaptureShare({ kind: target, share: incoming });
    }
    setIncoming(null);
  };
  const clearCaptureShare = useCallback(() => setCaptureShare(null), []);
  const shareList = async (format: ExportFormat) => {
    if (!kind) return;
    const notes = kind === 'boq' ? boqNotes : '';
    const name = `${titlePrefix(kind)}_${todayISO()}_${Date.now() % 100000}`;
    try {
      if (format === 'xlsx') {
        await shareFiles([await sheetToXlsx(listSheet(kind, activeItems, notes), `${name}.xlsx`, kind === 'audit' ? 'Purchases' : 'BOQ', [5, 30, 14, 14, 14, 10, 8, 8, 12, 14, 20, 12])]);
      } else {
        const doc = buildPdf(kind, activeItems, notes);
        await shareFiles(format === 'pdf' ? [pdfFile(doc, name)] : await pdfToJpegs(doc, name));
      }
    } catch (err) {
      await dialogs.alert('Could not create the file', (err as Error).message);
    }
  };

  const closeSettings = () => {
    setReminderTick((t) => t + 1);
    prefs.set('nirmaan_onboarded', true);
    setSettingsOpen(false);
    setFirstRun(false);
  };

  const canClear = kind ? activeItems.length > 0 : activeTab === 'history' && history.length > 0;

  return (
    <div className="min-h-screen bg-[var(--color-brand-gray)] flex flex-col overflow-x-hidden">
      <header className="border-b border-[var(--color-brand-concrete)] bg-white px-4 md:px-6 pb-4 pt-[max(1rem,env(safe-area-inset-top))] flex flex-col md:flex-row items-center justify-between sticky top-0 z-20 gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="w-10 h-10 bg-[var(--color-brand-primary)] rounded flex items-center justify-center text-white font-bold shadow-md shadow-orange-100 shrink-0">
            <HardHat size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-[var(--color-brand-dark)]">
              NIRMAN <span className="font-serif italic font-normal text-base opacity-70">by Akohsa</span>
            </h1>
            <p className="text-gray-500 font-mono uppercase tracking-widest leading-none mt-1 text-[11px]">Offline Material Management</p>
          </div>
          <div className="md:hidden">
            <StatusChip onClick={() => setSettingsOpen(true)} />
          </div>
        </div>

        <nav className="flex bg-gray-100 p-1 rounded-lg border border-gray-200 w-full md:w-auto overflow-x-auto no-scrollbar" aria-label="Sections">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              aria-current={activeTab === id ? 'page' : undefined}
              className={`flex-1 md:flex-none flex items-center justify-center gap-1 sm:gap-2 px-1.5 sm:px-3 md:px-4 py-2 rounded-md text-[11px] font-bold uppercase tracking-wide sm:tracking-wider transition-all whitespace-nowrap
                ${activeTab === id ? 'bg-white text-[var(--color-brand-dark)] shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2 md:gap-4 w-full md:w-auto justify-between md:justify-end">
          <div className="hidden md:block">
            <StatusChip onClick={() => setSettingsOpen(true)} />
          </div>
          {kind && (
            <div className="text-right pr-3 border-r border-gray-100 leading-tight">
              <div className="text-[11px] md:text-[11px] uppercase tracking-widest text-gray-400 font-mono">{kind === 'audit' ? 'Total Spent' : 'Items'}</div>
              <div className="text-xs md:text-sm font-mono font-bold">
                {kind === 'audit' ? `₹${totalSpent.toLocaleString('en-IN')}` : `${filteredItems.length} Recs`}
              </div>
            </div>
          )}

          <div className="flex items-center gap-1.5 md:gap-2 ml-auto">
            {kind && activeItems.length > 0 && (
              <>
                <button
                  onClick={openSave}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 md:px-3 md:py-2 bg-blue-600 text-white text-[11px] md:text-[11px] font-bold uppercase tracking-wider rounded-lg shadow-md hover:bg-blue-700 transition-colors whitespace-nowrap"
                >
                  <Save size={14} /> <span>Save</span>
                </button>
                <button
                  onClick={() => setPreviewOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 md:px-3 md:py-2 bg-white border border-gray-200 text-[var(--color-brand-dark)] text-[11px] md:text-[11px] font-bold uppercase tracking-wider rounded-lg shadow-sm hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  <Eye size={14} /> <span>Preview</span>
                </button>
                <button
                  onClick={() => setShareOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 md:px-3 md:py-2 bg-[var(--color-brand-primary)] text-white text-[11px] md:text-[11px] font-bold uppercase tracking-wider rounded-lg shadow-md hover:brightness-110 transition-colors whitespace-nowrap"
                >
                  <Share2 size={14} /> <span>Share</span>
                </button>
              </>
            )}
            {canClear && (
              <button onClick={clearCurrent} className="p-2 rounded-lg transition-all text-gray-300 hover:text-red-500 hover:bg-red-50" aria-label="Clear">
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>
      </header>

      <p className="mx-4 md:mx-6 mt-3 text-xs text-gray-600 leading-snug">{TABS.find((t) => t.id === activeTab)!.about}</p>

      {showBackupReminder && (
        <div role="status" className="mx-4 md:mx-6 mt-3 p-3 bg-orange-50 border border-orange-200 rounded-xl flex flex-wrap items-center gap-2 justify-between">
          <p className="text-xs text-orange-900">
            <b>Back up your data.</b> It is stored only on this phone. Last backup: {describeLastBackup()}.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                snoozeBackupReminder();
                setReminderTick((t) => t + 1);
              }}
              className="px-3 py-2 text-xs font-bold text-orange-800"
            >
              Later
            </button>
            <button onClick={() => setSettingsOpen(true)} className="px-3 py-2 bg-orange-500 text-white rounded-lg text-xs font-bold">
              Back up now
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col lg:flex-row lg:overflow-hidden lg:h-[calc(100vh-73px)]">
        {activeTab !== 'database' && (
          <section className="w-full lg:w-[400px] bg-white border-r border-[var(--color-brand-concrete)] flex flex-col p-4 md:p-6 lg:overflow-y-auto">
            {kind ? (
              <CapturePanel
                key={kind}
                kind={kind}
                onVendorQuote={() => setQuoteTarget('pick')}
                incoming={captureShare?.kind === kind ? captureShare.share : null}
                onIncomingUsed={clearCaptureShare}
              />
            ) : <HistorySidebar onNewBoq={() => setActiveTab('boq')} onSiteReport={() => setSiteReportOpen(true)} />}
          </section>
        )}

        <section className="flex-1 flex flex-col technical-grid lg:overflow-hidden bg-white mt-4 lg:mt-0">
          <div className="p-4 md:p-6 pb-0 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <h2 className="text-[11px] md:text-xs font-mono uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
              {activeTab === 'history' ? <History size={12} /> : activeTab === 'database' ? <Database size={12} /> : activeTab === 'auditor' ? <FileText size={12} /> : <FileCode size={12} />}
              {activeTab === 'history' ? 'Saved Sessions' : activeTab === 'database' ? 'Material Database' : activeTab === 'auditor' ? 'Purchase Log' : 'BOQ Draft'}
            </h2>
            <div className="relative w-full md:w-auto">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search"
                placeholder={activeTab === 'history' ? 'Search sessions...' : activeTab === 'database' ? 'Search materials...' : 'Filter items...'}
                className="w-full md:w-64 pl-8 pr-4 py-2 bg-gray-50 border border-[var(--color-brand-concrete)] rounded-full text-xs font-mono outline-none focus:border-gray-400 transition-all"
              />
            </div>
          </div>

          <div className="flex-1 lg:overflow-auto p-4 md:p-6">
            {activeTab === 'database' ? (
              <DatabaseView
                entries={filteredDatabase}
                materialFilter={materialFilter}
                onMaterialFilter={setMaterialFilter}
                categoryFilter={categoryFilter}
                onCategory={setCategoryFilter}
                addressFilter={addressFilter}
                onAddress={setAddressFilter}
              />
            ) : activeTab === 'history' ? (
              <HistoryView
                records={filteredHistory}
                categoryFilter={categoryFilter}
                onCategory={setCategoryFilter}
                addressFilter={addressFilter}
                onAddress={setAddressFilter}
                onEdit={editRecordDetails}
                onOpen={openRecord}
                onQuotes={(record) => setQuoteTarget(record.id)}
                onDeliveries={(record) => setDeliveriesFor(record.id)}
              />
            ) : (
              <ItemLog kind={kind!} items={filteredItems} searching={!!search} />
            )}
          </div>
        </section>
      </main>

      <AnimatePresence>
        {saveState && (
          <SaveModal
            key="save"
            initial={saveState.initial}
            categories={categoryNames}
            recentAddresses={uniqueAddresses}
            editing={!!saveState.recordId}
            allowSaveAsNew={!!saveState.recordId && !!saveState.kind}
            titlePrefix={saveState.titlePrefix}
            onSave={handleSave}
            onClose={() => setSaveState(null)}
          />
        )}
        {previewOpen && kind && (
          <PdfPreviewModal
            key="preview"
            kind={kind}
            items={activeItems}
            notes={kind === 'boq' ? boqNotes : ''}
            onDownload={() => setShareOpen(true)}
            onClose={() => setPreviewOpen(false)}
          />
        )}
        {shareOpen && kind && <ShareSheet key="share" title={kind === 'audit' ? 'purchase list' : 'BOQ'} onShare={shareList} onClose={() => setShareOpen(false)} />}
        {settingsOpen && <SettingsModal key="settings" onClose={closeSettings} firstRun={firstRun} />}
        {quoteTarget === 'pick' && (
          <BoqPicker
            key="boq-picker"
            onPick={setQuoteTarget}
            onClose={() => {
              setQuoteTarget(null);
              setQuoteShare(undefined);
            }}
          />
        )}
        {quoteTarget && quoteTarget !== 'pick' && (
          <QuotesView
            key="quotes"
            boqId={quoteTarget}
            initial={quoteShare}
            onClose={() => {
              setQuoteTarget(null);
              setQuoteShare(undefined);
            }}
          />
        )}
        {siteReportOpen && <SiteReport key="site-report" onClose={() => setSiteReportOpen(false)} />}
        {deliveriesFor && <DeliveriesSheet key="deliveries" recordId={deliveriesFor} onClose={() => setDeliveriesFor(null)} />}
        {incoming && <ShareTargetSheet key="share-target" share={incoming} hasSavedBoqs={savedBoqs.length > 0} onPick={routeShare} onClose={() => setIncoming(null)} />}
      </AnimatePresence>
    </div>
  );
}
