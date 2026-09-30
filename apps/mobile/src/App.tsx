import { useMemo, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Database, Download, Eye, FileCode, FileText, HardHat, History, LayoutDashboard, Save, Search, Trash2 } from 'lucide-react';
import Fuse from 'fuse.js';
import { guessCategory, todayISO } from '@nirman/shared';
import { AccountModal } from './components/AccountModal.tsx';
import { useDialogs } from './components/Dialogs.tsx';
import { PdfPreviewModal } from './components/PdfPreviewModal.tsx';
import { SaveModal } from './components/SaveModal.tsx';
import { SyncBadge } from './components/SyncBadge.tsx';
import type { ListKind, ListMeta } from './data/repo.ts';
import { CapturePanel } from './features/CapturePanel.tsx';
import { DatabaseView } from './features/DatabaseView.tsx';
import { HistorySidebar, HistoryView } from './features/HistoryView.tsx';
import { ItemLog } from './features/ItemLog.tsx';
import { shareFile } from './lib/files.ts';
import { buildPdf, pdfToBase64 } from './lib/pdf.ts';
import { useAppState, type HistoryRecord } from './state/AppState.tsx';

type AppTab = 'auditor' | 'boq' | 'history' | 'database';

const TABS: { id: AppTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'auditor', label: 'Auditor', icon: LayoutDashboard },
  { id: 'boq', label: 'BOQ', icon: FileCode },
  { id: 'database', label: 'Data', icon: Database },
  { id: 'history', label: 'History', icon: History },
];

interface SaveState {
  /** Record being edited, if any. */
  recordId?: string;
  /** Draft whose items are saved; absent when only editing a record's details. */
  kind?: ListKind;
  initial: ListMeta;
  titlePrefix: string;
}

/** Small per-device UI preferences. Storage can be unavailable, so never rely on it. */
const prefs = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore
    }
  },
};

const kindOf = (tab: AppTab): ListKind | null => (tab === 'auditor' ? 'audit' : tab === 'boq' ? 'boq' : null);

export default function App() {
  const state = useAppState();
  const { actions, history, itemDatabase, itemsFor, boqNotes, categoryNames, uniqueAddresses, session } = state;
  const dialogs = useDialogs();

  const [activeTab, setActiveTab] = useState<AppTab>('auditor');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [addressFilter, setAddressFilter] = useState('All');
  const [linkedRecord, setLinkedRecord] = useState<Record<ListKind, string | null>>(() =>
    prefs.get('nirmaan_linked_records', { audit: null, boq: null }),
  );
  const [saveState, setSaveState] = useState<SaveState | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(() => !session && !prefs.get('nirmaan_onboarded', false));
  const [firstRun] = useState(accountOpen);

  const kind = kindOf(activeTab);
  const activeItems = kind ? itemsFor(kind) : [];

  const linkRecord = (k: ListKind, id: string | null) => {
    setLinkedRecord((prev) => {
      const next = { ...prev, [k]: id };
      prefs.set('nirmaan_linked_records', next);
      return next;
    });
  };

  const search = searchQuery.trim();
  const filteredItems = useMemo(() => {
    if (!search) return activeItems;
    return new Fuse(activeItems, { keys: ['item_name', 'vendor', 'original_term'], threshold: 0.4 }).search(search).map((r) => r.item);
  }, [activeItems, search]);

  const matchesFilters = (category: string[], address: string[]) =>
    (categoryFilter === 'All' || category.some((c) => c.toLowerCase() === categoryFilter.toLowerCase())) &&
    (addressFilter === 'All' || address.includes(addressFilter));

  const filteredHistory = useMemo(() => {
    const base = search ? new Fuse(history, { keys: ['title', 'address', 'category'], threshold: 0.4 }).search(search).map((r) => r.item) : history;
    return base.filter((r) => matchesFilters([r.category], [r.address]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, search, categoryFilter, addressFilter]);

  const filteredDatabase = useMemo(() => {
    const base = search ? new Fuse(itemDatabase, { keys: ['name'], threshold: 0.4 }).search(search).map((r) => r.item) : itemDatabase;
    return base.filter((e) => matchesFilters(e.categories, e.addresses));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemDatabase, search, categoryFilter, addressFilter]);

  const totalSpent = kind === 'audit' ? filteredItems.reduce((acc, i) => acc + (i.total_amount || 0), 0) : 0;
  const titlePrefix = (k: ListKind) => (k === 'audit' ? 'Audit' : 'BOQ');

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
        message: `${history.length} sessions will be deleted from this phone and from your backup.`,
        confirmLabel: 'Delete all',
        danger: true,
      });
      if (ok) await actions.deleteAllHistory();
    }
  };

  const downloadPdf = async () => {
    if (!kind) return;
    try {
      const doc = buildPdf(kind, activeItems, kind === 'boq' ? boqNotes : '');
      await shareFile(`${titlePrefix(kind)}_${todayISO()}_${Date.now() % 100000}.pdf`, pdfToBase64(doc), 'application/pdf');
    } catch (err) {
      await dialogs.alert('Could not create the PDF', (err as Error).message);
    }
  };

  const closeAccount = () => {
    prefs.set('nirmaan_onboarded', true);
    setAccountOpen(false);
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
              NIRMĀṆ <span className="font-serif italic font-normal opacity-70">Auditor</span>
            </h1>
            <p className="text-gray-500 font-mono uppercase tracking-widest leading-none mt-1 text-[10px]">Offline Material Management</p>
          </div>
          <div className="md:hidden">
            <SyncBadge onClick={() => setAccountOpen(true)} />
          </div>
        </div>

        <nav className="flex bg-gray-100 p-1 rounded-lg border border-gray-200 w-full md:w-auto overflow-x-auto no-scrollbar" aria-label="Sections">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              aria-current={activeTab === id ? 'page' : undefined}
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-3 md:px-4 py-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap
                ${activeTab === id ? 'bg-white text-[var(--color-brand-dark)] shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2 md:gap-4 w-full md:w-auto justify-between md:justify-end">
          <div className="hidden md:block">
            <SyncBadge onClick={() => setAccountOpen(true)} />
          </div>
          {kind && (
            <div className="text-right pr-3 border-r border-gray-100 leading-tight">
              <div className="text-[8px] md:text-[9px] uppercase tracking-widest text-gray-400 font-mono">{kind === 'audit' ? 'Total Spent' : 'Items'}</div>
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
                  className="flex items-center gap-1.5 px-2.5 py-1.5 md:px-3 md:py-2 bg-blue-600 text-white text-[9px] md:text-[10px] font-bold uppercase tracking-wider rounded-lg shadow-md hover:bg-blue-700 transition-colors whitespace-nowrap"
                >
                  <Save size={14} /> <span>Save</span>
                </button>
                <button
                  onClick={() => setPreviewOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 md:px-3 md:py-2 bg-white border border-gray-200 text-[var(--color-brand-dark)] text-[9px] md:text-[10px] font-bold uppercase tracking-wider rounded-lg shadow-sm hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  <Eye size={14} /> <span>Preview</span>
                </button>
                <button
                  onClick={downloadPdf}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 md:px-3 md:py-2 bg-[var(--color-brand-primary)] text-white text-[9px] md:text-[10px] font-bold uppercase tracking-wider rounded-lg shadow-md hover:brightness-110 transition-colors whitespace-nowrap"
                >
                  <Download size={14} /> <span>PDF</span>
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

      <main className="flex-1 flex flex-col lg:flex-row lg:overflow-hidden lg:h-[calc(100vh-73px)]">
        {activeTab !== 'database' && (
          <section className="w-full lg:w-[400px] bg-white border-r border-[var(--color-brand-concrete)] flex flex-col p-4 md:p-6 lg:overflow-y-auto">
            {kind ? <CapturePanel key={kind} kind={kind} /> : <HistorySidebar onNewBoq={() => setActiveTab('boq')} />}
          </section>
        )}

        <section className="flex-1 flex flex-col technical-grid lg:overflow-hidden bg-white mt-4 lg:mt-0">
          <div className="p-4 md:p-6 pb-0 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <h2 className="text-[10px] md:text-xs font-mono uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
              {activeTab === 'history' ? <History size={12} /> : activeTab === 'database' ? <Database size={12} /> : activeTab === 'auditor' ? <FileText size={12} /> : <FileCode size={12} />}
              {activeTab === 'history' ? 'Saved Sessions' : activeTab === 'database' ? 'Material Database' : activeTab === 'auditor' ? 'Audit Log' : 'BOQ Draft'}
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
            onDownload={downloadPdf}
            onClose={() => setPreviewOpen(false)}
          />
        )}
        {accountOpen && <AccountModal key="account" onClose={closeAccount} firstRun={firstRun && !session} />}
      </AnimatePresence>
    </div>
  );
}
