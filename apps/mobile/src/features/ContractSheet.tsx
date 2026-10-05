import { useState } from 'react';
import { Banknote, Hammer, MinusCircle, Pencil, Phone, Share2, Trash2, X } from 'lucide-react';
import {
  contractTotals,
  describeEntry,
  describeTerms,
  parseAmount,
  paymentModeLabel,
  paymentModes,
  todayISO,
  workValue,
  type ContractEntryKind,
  type ContractEntryRow,
  type ContractRow,
} from '@nirman/shared';
import { useDialogs } from '../components/Dialogs.tsx';
import { UndoButton } from '../components/UndoButton.tsx';
import { Sheet } from '../components/ui/Sheet.tsx';
import { useBackHandler } from '../lib/backButton.ts';
import { useAppState } from '../state/AppState.tsx';
import { rupees } from './LabourView.tsx';
import { StatementSheet } from './StatementSheet.tsx';
import { Button } from '../components/ui/Button.tsx';

const KIND_LABEL: Record<ContractEntryKind, string> = { work: 'Work done', payment: 'Payment', deduction: 'Deduction' };

/** One contract: its terms, what is owed, and every measurement, payment and deduction. */
export function ContractSheet({ contractId, onEdit, onClose }: { contractId: string; onEdit(c: ContractRow): void; onClose(): void }) {
  const { contracts, entriesFor, actions, pendingDeletes } = useAppState();
  const dialogs = useDialogs();
  const contract = contracts.find((c) => c.id === contractId);
  const [entryForm, setEntryForm] = useState<{ kind: ContractEntryKind; entry?: ContractEntryRow } | null>(null);
  const [statementOpen, setStatementOpen] = useState(false);
  if (!contract) return null;

  const entries = entriesFor(contract.id);
  const t = contractTotals(contract, entries);
  const listed = [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
  const closed = contract.status === 'closed';

  const closeContract = async () => {
    const release = t.retention > 0;
    const ok = await dialogs.confirm('Close this contract?', {
      message: `It moves to Closed; entries can still be added.${release ? ` The retention held (${rupees(t.retention)}) is released today and becomes due.` : ''}`,
      confirmLabel: 'Close contract',
    });
    if (ok) await actions.setContractStatus(contract.id, 'closed', release ? todayISO() : '');
  };
  const deleteContract = async () => {
    const ok = await dialogs.confirm(`Delete the contract with ${contract.contractor}?`, {
      message: `Its ${entries.length} entries are deleted too. You can undo for a few seconds.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    actions.deleteContractLater(contract.id);
    onClose();
  };

  const stat = (label: string, value: React.ReactNode, sub?: React.ReactNode) => (
    <div className="p-2 bg-gray-50 rounded-lg border border-gray-100 min-w-0">
      <div className="text-[10px] font-mono uppercase tracking-wider text-gray-400">{label}</div>
      <div className="text-sm font-mono font-bold break-words">{value}</div>
      {sub && <div className="text-[10px] text-gray-500">{sub}</div>}
    </div>
  );

  return (
    <>
      <Sheet kind="screen" size="lg" layer="under" labelledBy="contract-title" onClose={onClose} backEnabled={!entryForm && !statementOpen} className="p-4 space-y-3">
        <div className="flex justify-between items-start gap-2">
          <div className="min-w-0">
            <h3 id="contract-title" className="font-bold text-gray-900 text-lg leading-tight">
              {contract.contractor}
            </h3>
            <p className="text-sm text-gray-700">{contract.work || 'Work not described'}</p>
            <p className="text-[11px] text-gray-500">{[contract.address, contract.category, contract.start_date && `from ${contract.start_date}`].filter(Boolean).join(' · ')}</p>
            <p className="text-[11px] text-gray-500">{describeTerms(contract, rupees)}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {contract.phone && (
              <a href={`tel:${contract.phone}`} className="p-2 text-green-700 bg-green-50 rounded-lg" aria-label={`Call ${contract.contractor}`}>
                <Phone size={16} />
              </a>
            )}
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-black" aria-label="Close">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2" role="status" aria-label="Contract totals">
          {stat('Work done', rupees(t.workDone), t.progress !== null ? `${Math.round(t.progress * 100)}% of ${rupees(t.value)}` : undefined)}
          {stat('Paid', rupees(t.paid))}
          {stat(
            t.balance < 0 ? 'Advance' : t.balance > 0 ? 'Balance due' : 'Balance',
            <span className={t.balance < 0 ? 'text-blue-700' : t.balance > 0 ? 'text-red-600' : 'text-green-700'}>{t.balance ? rupees(Math.abs(t.balance)) : 'Settled'}</span>,
          )}
          {contract.retention_pct > 0 &&
            stat(
              'Retention',
              rupees(t.retention),
              contract.retention_released_at ? (
                <button className="underline" onClick={() => actions.setRetentionReleased(contract.id, '')}>
                  released {contract.retention_released_at} · hold again
                </button>
              ) : (
                <button className="underline text-orange-700" onClick={() => actions.setRetentionReleased(contract.id, todayISO())}>
                  held · release now
                </button>
              ),
            )}
          {t.deductions > 0 && stat('Deductions', rupees(t.deductions))}
        </div>

        {entryForm ? (
          <EntryForm contract={contract} kind={entryForm.kind} entry={entryForm.entry} onDone={() => setEntryForm(null)} />
        ) : (
          <div className="flex gap-2">
            <Button variant="primary" className="flex-1" onClick={() => setEntryForm({ kind: 'work' })}>
              <Hammer size={14} /> Work
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => setEntryForm({ kind: 'payment' })}>
              <Banknote size={14} /> Payment
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => setEntryForm({ kind: 'deduction' })}>
              <MinusCircle size={14} /> Deduct
            </Button>
          </div>
        )}

        <div>
          <h4 className="text-[11px] font-mono uppercase tracking-widest text-gray-400 font-bold mb-1">Entries ({entries.length})</h4>
          {listed.length === 0 ? (
            <p className="text-xs text-gray-500 py-3">Nothing recorded yet. Add work as it is measured and every payment or advance.</p>
          ) : (
            <ul className="divide-y divide-gray-100 border border-gray-100 rounded-xl">
              {listed.map((e) => {
                const pending = pendingDeletes.has(e.id);
                const value = e.kind === 'work' ? workValue(contract, e) : e.amount;
                return (
                  <li key={e.id} className={`flex items-center gap-2 px-3 py-2 ${pending ? 'opacity-40' : ''}`}>
                    <button className="flex-1 min-w-0 text-left" onClick={() => setEntryForm({ kind: e.kind, entry: e })} disabled={pending} aria-label={`Edit ${KIND_LABEL[e.kind]} of ${e.date}`}>
                      <div className={`text-xs truncate ${pending ? 'line-through' : ''}`}>{describeEntry(contract, e)}</div>
                      <div className="text-[10px] text-gray-400 font-mono">{e.date}</div>
                    </button>
                    <span className={`text-xs font-mono font-bold shrink-0 ${e.kind === 'work' ? 'text-gray-800' : e.kind === 'payment' ? 'text-green-700' : 'text-red-600'}`}>
                      {e.kind === 'work' ? '+' : '−'}
                      {rupees(value)}
                    </span>
                    {pending ? (
                      <UndoButton onUndo={() => actions.undoDelete(e.id)} label={KIND_LABEL[e.kind]} />
                    ) : (
                      <button onClick={() => actions.deleteContractEntryLater(e.id)} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg shrink-0" aria-label={`Delete ${KIND_LABEL[e.kind]} of ${e.date}`}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {contract.notes && <p className="text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-lg p-2">{contract.notes}</p>}

        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button variant="secondary" onClick={() => setStatementOpen(true)}>
            <Share2 size={14} /> Statement
          </Button>
          <Button variant="secondary" onClick={() => onEdit(contract)}>
            <Pencil size={14} /> Edit terms
          </Button>
          <Button variant="secondary" onClick={() => (closed ? actions.setContractStatus(contract.id, 'active') : closeContract())}>
            {closed ? 'Reopen' : 'Close contract'}
          </Button>
          <Button variant="dangerOutline" onClick={deleteContract}>
            <Trash2 size={14} /> Delete
          </Button>
        </div>
      </Sheet>
      {statementOpen && <StatementSheet contract={contract} entries={entries} onClose={() => setStatementOpen(false)} />}
    </>
  );
}

/** Add or change one entry: work measured, a payment, or a deduction. */
function EntryForm({ contract, kind, entry, onDone }: { contract: ContractRow; kind: ContractEntryKind; entry?: ContractEntryRow; onDone(): void }) {
  const { actions } = useAppState();
  const dialogs = useDialogs();
  const isWork = kind === 'work';
  const [date, setDate] = useState(entry?.date ?? todayISO());
  const [value, setValue] = useState(entry ? String(isWork ? entry.quantity : entry.amount) : '');
  const [mode, setMode] = useState(entry?.mode || 'cash');
  const [note, setNote] = useState(entry?.note ?? '');
  useBackHandler(onDone);
  const n = value.trim() ? parseAmount(value) : null;
  const preview = isWork && n ? workValue(contract, { quantity: n }) : 0;

  const save = async () => {
    if (n === null || n <= 0) return dialogs.alert(isWork ? 'Enter the quantity done' : 'Enter the amount', value.trim() ? `“${value}” is not a number.` : undefined);
    if (!date) return dialogs.alert('Pick the date');
    await actions.saveContractEntry(
      { contract_id: contract.id, kind, date, quantity: isWork ? n : 0, amount: isWork ? 0 : n, mode: kind === 'payment' ? mode : '', note },
      entry?.id,
    );
    onDone();
  };

  const input = 'w-full min-w-0 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-400';
  const unit = contract.kind === 'rate' ? contract.unit || 'unit' : '% of job';
  return (
    <div className="p-3 bg-orange-50/50 border border-orange-200 rounded-xl space-y-2" role="group" aria-label={`${entry ? 'Edit' : 'Add'} ${KIND_LABEL[kind]}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-mono uppercase tracking-wider text-gray-600 font-bold">
          {entry ? 'Edit' : 'Add'} {KIND_LABEL[kind].toLowerCase()}
        </span>
        <button onClick={onDone} className="p-1 text-gray-400" aria-label="Cancel">
          <X size={16} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block min-w-0">
          <span className="text-xs font-bold text-gray-500">{isWork ? `Done (${unit})` : 'Amount ₹'}</span>
          <input aria-label={isWork ? 'Quantity done' : 'Amount'} inputMode="decimal" autoFocus value={value} onChange={(e) => setValue(e.target.value)} className={`${input} font-mono`} />
        </label>
        <label className="block min-w-0">
          <span className="text-xs font-bold text-gray-500">Date</span>
          <input type="date" aria-label="Entry date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
        </label>
      </div>
      {isWork && preview > 0 && <p className="text-xs text-gray-600">Worth {rupees(preview)}</p>}
      {kind === 'payment' && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Paid by">
          {paymentModes.map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`px-3 py-1 rounded-full text-[11px] font-bold ${mode === m ? 'bg-gray-800 text-white' : 'bg-white border border-gray-200 text-gray-500'}`}
            >
              {paymentModeLabel(m)}
            </button>
          ))}
        </div>
      )}
      <input
        aria-label="Entry note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className={input}
        placeholder={isWork ? 'e.g. Ground floor walls' : kind === 'payment' ? 'e.g. Advance, week 3' : 'e.g. Cement supplied, 10 bags'}
      />
      <Button variant="primary" block onClick={save}>
        {entry ? 'Save' : 'Add'}
      </Button>
    </div>
  );
}
