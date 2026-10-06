import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Database, Eye, FileCode, FileText, HardHat, History, LayoutDashboard, Plus, Save, Share2, ShoppingCart, Search, Trash2, Users, X } from 'lucide-react';
import Fuse from 'fuse.js';
import { filterMaterials, guessCategory, todayISO, type ContractRow, type MaterialFilter } from '@nirman/shared';
import { useDialogs } from './components/Dialogs.tsx';
import { Button } from './components/ui/Button.tsx';
import { useBackHandler } from './lib/backButton.ts';
import { prefs } from './lib/prefs.ts';
import { workTypeKey } from './lib/workType.ts';
import { logStep } from './lib/diagnostics.ts';
import { hasUnseenNotes, latestNotes, markNotesSeen } from './lib/whatsNew.ts';
import { WhatsNewModal } from './components/WhatsNewModal.tsx';
import { backupOverdue, describeLastBackup, snoozeBackupReminder } from './lib/backupReminder.ts';
import { PdfPreviewModal } from './components/PdfPreviewModal.tsx';
import { BoqPicker } from './features/BoqPicker.tsx';
import { QuotesView } from './features/QuotesView.tsx';
import { SaveModal } from './components/SaveModal.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { StatusChip } from './components/StatusChip.tsx';
import { DRAFT_IDS, type ListKind, type ListMeta } from './data/repo.ts';
import { CapturePanel, QueuedReadings } from './features/CapturePanel.tsx';
import { Sheet, SheetHeader } from './components/ui/Sheet.tsx';
import { useMediaQuery } from './lib/useMediaQuery.ts';
import { DatabaseView } from './features/DatabaseView.tsx';
import { HistorySidebar, HistoryView } from './features/HistoryView.tsx';
import { DeliveriesSheet } from './features/DeliveriesSheet.tsx';
import { SiteReport } from './features/SiteReport.tsx';
import { ItemLog } from './features/ItemLog.tsx';
import { LabourSidebar, LabourView, type StatusFilter } from './features/LabourView.tsx';
import { ContractSheet } from './features/ContractSheet.tsx';
import { ContractForm } from './components/ContractForm.tsx';
import { buildPdf } from './lib/pdf.ts';
import { listSheet, pdfFile, pdfToJpegs, sheetToXlsx, type ExportFormat } from './lib/exports.ts';
import { shareFiles } from './lib/files.ts';
import { ShareSheet } from './components/ShareSheet.tsx';
import { BoqShareChoice, OrderSlipSheet } from './components/OrderSlipSheet.tsx';
import { ShareTargetSheet, type ShareTarget } from './components/ShareTargetSheet.tsx';
import { onIncomingShare, type IncomingShare } from './lib/sharedFiles.ts';
import { useAppState, type HistoryRecord } from './state/AppState.tsx';

type AppTab = 'auditor' | 'boq' | 'labour' | 'history' | 'database';

/** `about` is the one line shown under the tabs saying what the open tab does. */
const TABS: { id: AppTab; label: string; icon: typeof LayoutDashboard; about: string }[] = [
  { id: 'auditor', label: 'Purchases', icon: ShoppingCart, about: 'Photograph bills or type what was bought; get a purchase list with the rate paid for each item.' },
  { id: 'boq', label: 'BOQ', icon: FileCode, about: 'Photograph a drawing or list; get a blank BOQ (no rates) to send vendors, then compare their quotes.' },
  { id: 'labour', label: 'Labour', icon: Users, about: 'Labour contracts: record work measured, payments and deductions; see what each contractor is owed and share statements.' },
  { id: 'database', label: 'Rates', icon: Database, about: 'Every price you have recorded, per material, to see how rates change over time.' },
  { id: 'history', label: 'Saved', icon: History, about: 'Saved purchase lists and BOQs. Open one to edit it, export it, or add vendor quotes.' },
];

interface SaveState {
  /** Record being edited, if any. */
  recordId?: string;
  /** Draft whose items are saved; absent when only editing a record's details. */
  kind?: ListKind;
  initial: ListMeta;
  titlePrefix: string;
  /** Purchase lists: the lines' vendor, to change on all of them at once. */
  vendor?: { initial: string; mixed: boolean };
}

/** One vendor on every line, or several. */
function vendorOf(items: { vendor: string }[]): { initial: string; mixed: boolean } {
  const vendors = [...new Set(items.map((i) => i.vendor.trim()).filter(Boolean))];
  return { initial: vendors.length === 1 ? vendors[0] : '', mixed: vendors.length > 1 };
}

/** Below 480 px Preview and Share show only their icons (Save below 360 px), so the header fits 320 px. */
const NARROW_ICON = 'max-[479px]:w-9 max-[479px]:px-0';

const kindOf = (tab: AppTab): ListKind | null => (tab === 'auditor' ? 'audit' : tab === 'boq' ? 'boq' : null);

export default function App() {
  const state = useAppState();
  const { actions, history, itemDatabase, itemsFor, boqNotes, categoryNames, uniqueAddresses, settings, pendingDeletes, savedBoqs, contracts, allAddresses, knownVendors, quotesFor } = state;
  const dialogs = useDialogs();

  const [activeTab, setActiveTab] = useState<AppTab>('auditor');
  useEffect(() => logStep('tab', { to: activeTab }), [activeTab]);
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
  // After an update, show what's new once; a new install has nothing to compare with.
  const [whatsNewOpen, setWhatsNewOpen] = useState(() => {
    if (settingsOpen) {
      markNotesSeen();
      return false;
    }
    return hasUnseenNotes();
  });
  const closeWhatsNew = () => {
    markNotesSeen();
    setWhatsNewOpen(false);
  };

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

  const [contractStatus, setContractStatus] = useState<StatusFilter>('active');
  const filteredContracts = useMemo(() => {
    const base = search ? new Fuse(contracts, { keys: ['contractor', 'work', 'address', 'phone', 'category'], threshold: 0.4 }).search(search).map((r) => r.item) : contracts;
    return base.filter((c) => (contractStatus === 'all' || c.status === contractStatus) && matchesFilters([c.category], [c.address]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contracts, search, categoryFilter, addressFilter, contractStatus]);
  /** Contract being added (no contract) or edited. */
  const [contractForm, setContractForm] = useState<{ contract?: ContractRow } | null>(null);
  const [openContract, setOpenContract] = useState<string | null>(null);
  const contractors = useMemo(() => {
    const byName = new Map<string, { name: string; phone: string }>();
    for (const c of contracts) if (!byName.has(c.contractor.toLowerCase())) byName.set(c.contractor.toLowerCase(), { name: c.contractor, phone: c.phone });
    return [...byName.values()];
  }, [contracts]);
  const saveContract = async (input: Parameters<typeof actions.saveContract>[0]) => {
    const editing = contractForm?.contract;
    const id = await actions.saveContract(input, editing?.id);
    if (input.address) prefs.set('nirmaan_contract_site', input.address);
    if (!editing) setOpenContract(id);
  };

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
        category: record?.category || prefs.get(workTypeKey(kind), '') || guessCategory(activeItems),
        site_date: todayISO(),
      },
      vendor: kind === 'audit' ? vendorOf(activeItems) : undefined,
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
      vendor: record.kind === 'audit' && record.items.length ? vendorOf(record.items) : undefined,
    });

  const deleteRecord = async (recordId: string) => {
    const record = history.find((r) => r.id === recordId);
    if (!record) return;
    const quotes = quotesFor(record.id).length;
    const ok = await dialogs.confirm(`Delete “${record.title}”?`, {
      message: `${record.items.length} items${quotes ? ` and ${quotes} vendor quotes` : ''} will be removed from this phone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setSaveState(null);
    await actions.deleteList(record.id);
  };

  const handleSave = async (meta: ListMeta, asNew: boolean, vendor?: string) => {
    if (!saveState) return;
    await actions.flushDeletes();
    const { kind: k, recordId } = saveState;
    setSaveState(null);
    if (!k) {
      if (recordId) {
        await actions.updateListMeta(recordId, meta);
        if (vendor) await actions.setListVendor(recordId, vendor);
      }
      return;
    }
    if (vendor && k === 'audit') await actions.setListVendor(DRAFT_IDS.audit, vendor);
    const id = await actions.saveDraftToHistory(k, meta, asNew ? undefined : recordId);
    if (!asNew) linkRecord(k, id);
    // The next bill shouldn't be added to this session by accident.
    const fresh = await dialogs.confirm(`Saved “${meta.title || titlePrefix(k)}”`, {
      message: 'Start a new list for the next bill, or keep editing this one (saving again updates it).',
      confirmLabel: 'Start new list',
      cancelLabel: 'Keep editing',
    });
    if (fresh) await startNewList(k);
  };

  const startNewList = async (k: ListKind) => {
    await actions.clearListItems(k === 'audit' ? 'draft-audit' : 'draft-boq');
    if (k === 'boq') await actions.setListNotes(DRAFT_IDS.boq, '');
    linkRecord(k, null);
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

  /** Repeat order: the session's lines go into the purchase list, dated today and not yet delivered. */
  const buyAgain = async (record: HistoryRecord) => {
    const current = itemsFor('audit').length;
    if (current > 0) {
      const ok = await dialogs.confirm(`Add ${record.items.length} items to the current list?`, {
        message: `The purchase list already has ${current} items. Save or clear it first to keep the bills separate.`,
        confirmLabel: 'Add them',
      });
      if (!ok) return;
    } else {
      linkRecord('audit', null);
    }
    await actions.addItems(
      DRAFT_IDS.audit,
      record.items.map((i) => ({ ...i, date: todayISO() })),
    );
    setActiveTab('auditor');
  };

  const clearCurrent = async () => {
    if (!kind) return;
    const ok = await dialogs.confirm(`Clear the ${titlePrefix(kind)} draft?`, {
      message: `${activeItems.length === 1 ? 'The 1 item' : `All ${activeItems.length} items`} in the current draft will be removed. Saved lists are not affected.`,
      confirmLabel: 'Clear',
      danger: true,
    });
    if (!ok) return;
    await startNewList(kind);
  };

  const deleteAllSaved = async () => {
    const ok = await dialogs.confirm('Delete all saved lists?', {
      message: `${history.length} saved ${history.length === 1 ? 'list' : 'lists'} will be permanently deleted from this phone.`,
      confirmLabel: 'Delete all',
      danger: true,
    });
    if (ok) await actions.deleteAllHistory();
  };

  const [shareOpen, setShareOpen] = useState(false);
  const [boqChoiceOpen, setBoqChoiceOpen] = useState(false);
  const [orderSlipOpen, setOrderSlipOpen] = useState(false);
  // A BOQ can go out for quotes or as an order slip; a purchase list goes straight to the formats.
  const openShare = () => (kind === 'boq' ? setBoqChoiceOpen(true) : setShareOpen(true));
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
  /** Phones and small tablets: the list fills the screen and the entry form opens from the Add button. */
  const wide = useMediaQuery('(min-width: 1024px)');
  const [addOpen, setAddOpen] = useState(false);
  useEffect(() => setAddOpen(false), [activeTab]);
  // Something shared from another app opens the entry form with it.
  useEffect(() => {
    if (captureShare) setAddOpen(true);
  }, [captureShare]);
  const capturePanel = kind && (
    <CapturePanel
      key={kind}
      kind={kind}
      onVendorQuote={() => {
        setAddOpen(false);
        setQuoteTarget('pick');
      }}
      incoming={captureShare?.kind === kind ? captureShare.share : null}
      onIncomingUsed={clearCaptureShare}
      showJobs={wide}
      inSheet={!wide}
      onQueued={() => {
        setAddOpen(false);
        dialogs.toast('Sent to be read. The items will appear in the list.');
      }}
    />
  );
  const shareList = async (format: ExportFormat) => {
    if (!kind) return;
    logStep('share', { what: kind, format, lines: activeItems.length });
    const notes = kind === 'boq' ? boqNotes : '';
    const name = `${titlePrefix(kind)}_${todayISO()}_${Date.now() % 100000}`;
    try {
      if (format === 'xlsx') {
        await shareFiles([await sheetToXlsx(listSheet(kind, activeItems, notes), `${name}.xlsx`, kind === 'audit' ? 'Purchases' : 'BOQ', [5, 30, 14, 14, 14, 10, 8, 8, 26, 12, 14, 20, 12])]);
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

  // Saved has its own labelled "Delete all saved lists" at the end of the list, not a bare bin up here.
  const canClear = !!kind && activeItems.length > 0;

  return (
    <div className="min-h-screen lg:h-screen bg-[var(--color-brand-gray)] flex flex-col overflow-x-hidden lg:overflow-hidden">
      <header className="bg-white border-b border-[var(--color-brand-concrete)] sticky top-0 z-20 pt-[var(--inset-top)]">
        <div className="px-4 md:px-6 h-14 flex items-center gap-3">
          <div className="w-8 h-8 bg-[var(--color-brand-primary)] rounded flex items-center justify-center text-white shrink-0">
            <HardHat size={18} />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-[var(--color-brand-dark)] whitespace-nowrap">
            NIRMAN <span className="hidden min-[400px]:inline font-serif italic font-normal text-sm opacity-70">by Akohsa</span>
          </h1>
          <nav className="hidden lg:flex bg-gray-100 p-1 rounded-lg border border-gray-200 ml-4" aria-label="Sections">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                aria-label={label}
                aria-current={activeTab === id ? 'page' : undefined}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition-all whitespace-nowrap ${
                  activeTab === id ? 'bg-white text-[var(--color-brand-dark)] shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </nav>
          <div className="ml-auto">
            <StatusChip onClick={() => setSettingsOpen(true)} />
          </div>
        </div>
        {(kind || canClear) && (
          <div className="px-4 md:px-6 pb-2 flex items-center gap-2 justify-between">
          {kind && (
            <div className="min-w-0 leading-tight">
              <div className="text-xs text-gray-500 whitespace-nowrap font-semibold">{kind === 'audit' ? 'Spent' : 'Items'}</div>
              <div className="text-xs md:text-sm font-mono font-bold" data-testid="header-total">
                {kind === 'audit' ? `₹${totalSpent.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : `${filteredItems.length}`}
              </div>
            </div>
          )}

          <div className="flex items-center gap-1 min-[360px]:gap-1.5 md:gap-2 ml-auto shrink-0">
            {kind && activeItems.length > 0 && (
              <>
                <Button variant="primary" size="sm" onClick={openSave} aria-label="Save" className="max-[359px]:w-9 max-[359px]:px-0">
                  <Save size={14} /> <span className="hidden min-[360px]:inline">Save</span>
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setPreviewOpen(true)} aria-label="Preview" className={NARROW_ICON}>
                  <Eye size={14} /> <span className="hidden min-[480px]:inline">Preview</span>
                </Button>
                <Button variant="secondary" size="sm" onClick={openShare} aria-label="Share" className={NARROW_ICON}>
                  <Share2 size={14} /> <span className="hidden min-[480px]:inline">Share</span>
                </Button>
              </>
            )}
            {canClear && (
              <button onClick={clearCurrent} className="p-2.5 rounded-lg transition-all text-gray-500 hover:text-red-500 hover:bg-red-50" aria-label="Clear">
                <Trash2 size={16} />
              </button>
            )}
          </div>
          </div>
        )}
      </header>

      <p className="mx-4 md:mx-6 mt-3 text-xs text-gray-600 leading-snug">{TABS.find((t) => t.id === activeTab)!.about}</p>

      {showBackupReminder && (
        <div role="status" className="mx-4 md:mx-6 mt-2 px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-lg flex items-center gap-2 text-xs text-orange-900">
          <span className="flex-1 min-w-0 truncate" title="Your data is stored only on this phone.">
            Last backup: <b>{describeLastBackup()}</b>
          </span>
          <button onClick={() => setSettingsOpen(true)} className="font-bold text-orange-700 underline shrink-0">
            Back up
          </button>
          <button
            onClick={() => {
              snoozeBackupReminder();
              setReminderTick((t) => t + 1);
            }}
            className="p-2.5 -m-1.5 text-orange-700 shrink-0"
            aria-label="Remind me later"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Phones: the bottom tab bar (and the Add button above it) need room under the page. */}
      <main className={`flex-1 flex flex-col lg:flex-row lg:min-h-0 mt-3 lg:mt-0 lg:pb-0 ${kind ? 'pb-[calc(9rem+var(--inset-bottom))]' : 'pb-[calc(5rem+var(--inset-bottom))]'}`}>
        {activeTab !== 'database' && (wide || !kind) && (
          <section className="w-full lg:w-[400px] bg-white border-r border-[var(--color-brand-concrete)] flex flex-col p-4 md:p-6 lg:overflow-y-auto">
            {kind ? (
              capturePanel
            ) : activeTab === 'labour' ? (
              <LabourSidebar contracts={filteredContracts} onNew={() => setContractForm({})} onSiteReport={() => setSiteReportOpen(true)} />
            ) : (
              <HistorySidebar onNewBoq={() => setActiveTab('boq')} onSiteReport={() => setSiteReportOpen(true)} />
            )}
          </section>
        )}

        <section className={`flex-1 flex flex-col technical-grid lg:overflow-hidden bg-white ${kind && !wide ? '' : 'mt-4 lg:mt-0'}`}>
          <div className="p-4 md:p-6 pb-0 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <h2 className="text-xs md:text-xs text-gray-500 flex items-center gap-2 font-semibold">
              {activeTab === 'history' ? <History size={12} /> : activeTab === 'database' ? <Database size={12} /> : activeTab === 'labour' ? <Users size={12} /> : activeTab === 'auditor' ? <FileText size={12} /> : <FileCode size={12} />}
              {activeTab === 'history' ? 'Saved lists' : activeTab === 'database' ? 'Rates by material' : activeTab === 'labour' ? 'Labour contracts' : activeTab === 'auditor' ? 'Purchase list' : 'BOQ draft'}
            </h2>
            <div className="relative w-full md:w-auto">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search"
                placeholder={activeTab === 'history' ? 'Search saved lists…' : activeTab === 'database' ? 'Search materials…' : activeTab === 'labour' ? 'Search contractors…' : 'Search items…'}
                className="w-full md:w-64 pl-8 pr-4 py-2 bg-gray-50 border border-[var(--color-brand-concrete)] rounded-full text-sm outline-none focus:border-gray-400 transition-all"
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
            ) : activeTab === 'labour' ? (
              <LabourView
                contracts={filteredContracts}
                status={contractStatus}
                onStatus={setContractStatus}
                categoryFilter={categoryFilter}
                onCategory={setCategoryFilter}
                addressFilter={addressFilter}
                onAddress={setAddressFilter}
                onOpen={(c) => setOpenContract(c.id)}
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
                onBuyAgain={buyAgain}
                onDeleteAll={deleteAllSaved}
              />
            ) : (
              <>
                {!wide && <QueuedReadings kind={kind!} />}
                <ItemLog kind={kind!} items={filteredItems} searching={!!search} onIndex={openSave} onAdd={wide ? undefined : () => setAddOpen(true)} />
              </>
            )}
          </div>
        </section>
      </main>

      {kind && !wide && listedItems.length > 0 && (
        <button
          onClick={() => setAddOpen(true)}
          className="fixed right-4 z-30 bottom-[calc(5rem+var(--inset-bottom))] h-14 pl-4 pr-5 rounded-full bg-[var(--color-brand-primary)] text-white font-bold shadow-lg shadow-orange-200 flex items-center gap-2"
        >
          <Plus size={22} /> Add
        </button>
      )}

      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-[var(--color-brand-concrete)] grid grid-cols-5 pb-[var(--inset-bottom)]"
        aria-label="Sections"
      >
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            aria-label={label}
            aria-current={activeTab === id ? 'page' : undefined}
            className={`h-16 min-w-0 flex flex-col items-center justify-center gap-1 text-xs font-semibold ${activeTab === id ? 'text-[var(--color-brand-primary)]' : 'text-gray-500'}`}
          >
            <span className={`px-4 py-1 rounded-full ${activeTab === id ? 'bg-orange-100' : ''}`}>
              <Icon size={20} />
            </span>
            <span className="max-w-full truncate px-0.5">{label}</span>
          </button>
        ))}
      </nav>

      {/* Phones: the entry form opens over the list. It stays loaded when closed, so a half-typed entry isn't lost. */}
      {kind && !wide && (
        <Sheet key={`add-${kind}`} open={addOpen} size="lg" labelledBy="add-title" onClose={() => setAddOpen(false)} className="p-4 gap-4">
          <SheetHeader id="add-title" title={kind === 'audit' ? 'Add purchases' : 'Add to BOQ'} onClose={() => setAddOpen(false)} />
          {capturePanel}
        </Sheet>
      )}

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
            vendor={saveState.vendor && { ...saveState.vendor, known: knownVendors }}
            onDelete={saveState.recordId && !saveState.kind ? () => deleteRecord(saveState.recordId!) : undefined}
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
            onDownload={openShare}
            onClose={() => setPreviewOpen(false)}
          />
        )}
        {boqChoiceOpen && (
          <BoqShareChoice
            key="boq-share"
            onClose={() => setBoqChoiceOpen(false)}
            onPick={(choice) => {
              setBoqChoiceOpen(false);
              if (choice === 'order') setOrderSlipOpen(true);
              else setShareOpen(true);
            }}
          />
        )}
        {orderSlipOpen && kind === 'boq' && (
          <OrderSlipSheet
            key="order-slip"
            items={activeItems}
            notes={boqNotes}
            address={history.find((r) => r.id === linkedRecord.boq)?.address ?? ''}
            addresses={uniqueAddresses}
            onClose={() => setOrderSlipOpen(false)}
          />
        )}
        {shareOpen && kind && <ShareSheet key="share" title={kind === 'audit' ? 'purchase list' : 'BOQ'} onShare={shareList} onClose={() => setShareOpen(false)} />}
        {settingsOpen && <SettingsModal key="settings" onClose={closeSettings} firstRun={firstRun} onWhatsNew={() => setWhatsNewOpen(true)} />}
        {whatsNewOpen && latestNotes && <WhatsNewModal key="whats-new" notes={latestNotes} onClose={closeWhatsNew} />}
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
        {openContract && (
          <ContractSheet key="contract" contractId={openContract} onEdit={(contract) => setContractForm({ contract })} onClose={() => setOpenContract(null)} />
        )}
        {contractForm && (
          <ContractForm
            key="contract-form"
            contract={contractForm.contract}
            defaults={{
              address: addressFilter !== 'All' ? addressFilter : prefs.get('nirmaan_contract_site', ''),
              category: categoryFilter !== 'All' ? categoryFilter : categoryNames[0] || 'Civil',
            }}
            addresses={allAddresses}
            categories={categoryNames}
            contractors={contractors}
            onSave={saveContract}
            onClose={() => setContractForm(null)}
          />
        )}
        {siteReportOpen && <SiteReport key="site-report" onClose={() => setSiteReportOpen(false)} />}
        {deliveriesFor && <DeliveriesSheet key="deliveries" recordId={deliveriesFor} onClose={() => setDeliveriesFor(null)} />}
        {incoming && <ShareTargetSheet key="share-target" share={incoming} hasSavedBoqs={savedBoqs.length > 0} onPick={routeShare} onClose={() => setIncoming(null)} />}
      </AnimatePresence>
    </div>
  );
}
