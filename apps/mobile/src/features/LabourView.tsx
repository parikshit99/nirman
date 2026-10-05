import { ClipboardList, HardHat, Plus, Users } from 'lucide-react';
import { contractTotals, sumTotals, type ContractRow, type ContractTotals } from '@nirman/shared';
import { FilterChips } from '../components/FilterChips.tsx';
import { UndoButton } from '../components/UndoButton.tsx';
import { EmptyState } from '../components/ui/EmptyState.tsx';
import { Tabs } from '../components/ui/Tabs.tsx';
import { useAppState } from '../state/AppState.tsx';
import { Button } from '../components/ui/Button.tsx';

export const rupees = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

export type StatusFilter = 'active' | 'closed' | 'all';

/** Balance due, or an advance when more was paid than earned. */
export function BalanceText({ balance, className = '' }: { balance: number; className?: string }) {
  if (balance < 0) return <span className={`text-blue-700 ${className}`}>Advance {rupees(-balance)}</span>;
  return <span className={`${balance > 0 ? 'text-red-600' : 'text-green-700'} ${className}`}>{balance > 0 ? `Due ${rupees(balance)}` : 'Settled'}</span>;
}

/** Left panel of the Labour tab: totals for the contracts shown, and the button to add one. */
export function LabourSidebar({ contracts, onNew, onSiteReport }: { contracts: ContractRow[]; onNew(): void; onSiteReport(): void }) {
  const { entriesFor, contracts: all } = useAppState();
  const hasSites = all.some((c) => c.address);
  const totals = sumTotals(contracts.map((c) => contractTotals(c, entriesFor(c.id))));
  const box = 'p-2 bg-gray-50 rounded-lg border border-gray-100';
  return (
    <div className="space-y-3">
      <div className="hidden lg:block p-4 bg-orange-50 border border-orange-100 rounded-xl">
        <h3 className="text-sm font-bold text-orange-900 flex items-center gap-2">
          <Users size={16} /> Labour contracts
        </h3>
        <p className="text-xs text-orange-700 mt-1">Record work measured, payments and deductions for each contractor; the balance due is worked out for you.</p>
      </div>
      {contracts.length > 0 && (
        <div className="grid grid-cols-3 gap-2 text-center" role="status" aria-label="Totals for the contracts shown">
          <div className={box}>
            <div className="text-xs text-gray-500 font-semibold">Work done</div>
            <div className="text-xs font-mono font-bold">{rupees(totals.workDone)}</div>
          </div>
          <div className={box}>
            <div className="text-xs text-gray-500 font-semibold">Paid</div>
            <div className="text-xs font-mono font-bold">{rupees(totals.paid)}</div>
          </div>
          <div className={box}>
            <div className="text-xs text-gray-500 font-semibold">Balance</div>
            <div className="text-xs font-mono font-bold">
              <BalanceText balance={totals.balance} />
            </div>
          </div>
        </div>
      )}
      <div className={`grid gap-2 ${hasSites ? 'grid-cols-2 lg:grid-cols-1' : 'grid-cols-1'}`}>
        <Button variant="primary" block onClick={onNew}>
          <Plus size={14} /> New contract
        </Button>
        {hasSites && (
          <Button variant="secondary" block onClick={onSiteReport}>
            <ClipboardList size={14} /> Site report
          </Button>
        )}
      </div>
    </div>
  );
}

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: 'active', label: 'Ongoing' },
  { id: 'closed', label: 'Closed' },
  { id: 'all', label: 'All' },
];

interface Props {
  contracts: ContractRow[];
  status: StatusFilter;
  onStatus(s: StatusFilter): void;
  categoryFilter: string;
  onCategory(c: string): void;
  addressFilter: string;
  onAddress(a: string): void;
  onOpen(c: ContractRow): void;
}

/** Contracts as cards: who, what and where, progress, and what is owed. */
export function LabourView({ contracts, status, onStatus, categoryFilter, onCategory, addressFilter, onAddress, onOpen }: Props) {
  const { contracts: all, entriesFor, pendingDeletes, categoryNames, actions } = useAppState();
  const sites = [...new Set(all.map((c) => c.address).filter(Boolean))].sort();
  const usedCategories = new Set(all.map((c) => c.category));

  return (
    <div className="space-y-4">
      {all.length > 0 && (
        <>
          <FilterChips
            categories={categoryNames.filter((c) => usedCategories.has(c))}
            categoryFilter={categoryFilter}
            onCategory={onCategory}
            addresses={sites}
            addressFilter={addressFilter}
            onAddress={onAddress}
            addressLabel="Sites"
          />
          <Tabs label="Contract status" options={STATUS_TABS} value={status} onChange={onStatus} className="md:max-w-sm" />
        </>
      )}

      {contracts.length === 0 ? (
        <EmptyState icon={HardHat} title={all.length ? 'No contracts match.' : 'No labour contracts yet.'}>
          {all.length ? 'Check the filters or search.' : 'Add one with “New contract”: the contractor, the job, and the rate or lump sum.'}
        </EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {contracts.map((c) => (
            <div key={c.id} className="relative">
              <ContractCard contract={c} totals={contractTotals(c, entriesFor(c.id))} pending={pendingDeletes.has(c.id)} onOpen={() => onOpen(c)} />
              {pendingDeletes.has(c.id) && (
                <div className="absolute top-3 right-3">
                  <UndoButton onUndo={() => actions.undoDelete(c.id)} label={c.contractor} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ContractCard({ contract: c, totals: t, pending, onOpen }: { contract: ContractRow; totals: ContractTotals; pending: boolean; onOpen(): void }) {
  const progress = t.progress === null ? null : Math.min(1, t.progress);
  return (
    <button
      onClick={onOpen}
      disabled={pending}
      className={`w-full text-left p-4 bg-white border border-[var(--color-brand-concrete)] rounded-xl shadow-sm hover:border-orange-300 transition-colors ${pending ? 'opacity-40 line-through' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold text-gray-900 truncate">{c.contractor}</div>
          <div className="text-xs text-gray-600 truncate">{c.work || 'Work not described'}</div>
          <div className="text-xs text-gray-500 truncate">{[c.address, c.category].filter(Boolean).join(' · ')}</div>
        </div>
        <span
          className={`shrink-0 text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded ${c.status === 'closed' ? 'bg-gray-100 text-gray-500' : 'bg-orange-50 text-orange-700'}`}
        >
          {c.status === 'closed' ? 'Closed' : c.kind === 'rate' ? `₹${c.rate}/${c.unit || 'unit'}` : 'Lump sum'}
        </span>
      </div>
      {progress !== null && (
        <div className="mt-2">
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-orange-500" style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {Math.round((t.progress ?? 0) * 100)}% done
            {c.kind === 'rate' && ` · ${t.doneQty.toLocaleString('en-IN')} of ${c.est_quantity.toLocaleString('en-IN')} ${c.unit}`}
          </div>
        </div>
      )}
      <div className="mt-2 grid grid-cols-3 gap-1 text-xs font-mono">
        <span className="text-gray-500">
          Work <b className="text-gray-800">{rupees(t.workDone)}</b>
        </span>
        <span className="text-gray-500">
          Paid <b className="text-gray-800">{rupees(t.paid)}</b>
        </span>
        <BalanceText balance={t.balance} className="font-bold text-right" />
      </div>
    </button>
  );
}
