import { useState, type ReactNode } from 'react';
import { Linking, Pressable, Text, TextInput, View } from 'react-native';
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
  isPaidOut,
} from '@nirman/shared';
import { UndoButton } from '../components/UndoButton';
import { Button } from '../components/ui/Button';
import { useDialogs } from '../components/ui/Dialogs';
import { Icon } from '../components/ui/Icon';
import { NumberField } from '../components/ui/fields';
import { DateField } from '../components/ui/Select';
import { Sheet } from '../components/ui/Sheet';
import { plural } from '../lib/format';
import { useAppState } from '../state/AppState';
import { useColors } from '../theme';
import { rupees } from './LabourScreen';
import { StatementSheet } from './StatementSheet';

const KIND_LABEL: Record<ContractEntryKind, string> = { work: 'Work done', payment: 'Payment', advance: 'Advance (kharcha)', deduction: 'Deduction' };

/** One contract: its terms, what is owed, and every measurement, payment and deduction. */
export function ContractSheet({ contractId, onEdit, onClose }: { contractId: string; onEdit(c: ContractRow): void; onClose(): void }) {
  const c = useColors();
  const { contracts, entriesFor, actions, pendingDeletes } = useAppState();
  const dialogs = useDialogs();
  const contract = contracts.find((x) => x.id === contractId);
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
      message: `Its ${plural(entries.length, 'entry', 'entries')} are deleted too. You can undo for a few seconds.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    actions.deleteContractLater(contract.id);
    onClose();
  };

  const stat = (label: string, value: ReactNode, sub?: ReactNode) => (
    <View style={{ flexGrow: 1, flexBasis: '30%', minWidth: 96, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: c.gray100, backgroundColor: c.gray50 }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: c.gray500 }}>{label}</Text>
      <Text style={{ fontSize: 14, fontFamily: 'monospace', fontWeight: '700', color: c.brandDark }}>{value}</Text>
      {sub ? <Text style={{ fontSize: 12, color: c.gray500 }}>{sub}</Text> : null}
    </View>
  );

  return (
    <>
      <Sheet kind="screen" label={`Contract with ${contract.contractor}`} onClose={onClose} backEnabled={!entryForm && !statementOpen} gap={12}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: '700', color: c.gray900 }}>
              {contract.contractor}
            </Text>
            <Text style={{ fontSize: 14, color: c.gray700 }}>{contract.work || 'Work not described'}</Text>
            <Text style={{ fontSize: 12, color: c.gray500 }}>{[contract.address, contract.category, contract.start_date && `from ${contract.start_date}`].filter(Boolean).join(' · ')}</Text>
            <Text style={{ fontSize: 12, color: c.gray500 }}>{describeTerms(contract, rupees)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {!!contract.phone && (
              <Pressable accessibilityRole="button" accessibilityLabel={`Call ${contract.contractor}`} onPress={() => void Linking.openURL(`tel:${contract.phone}`)} style={{ minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: c.green50 }}>
                <Icon name="call" size={16} color={c.green700} />
              </Pressable>
            )}
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="close" size={22} color={c.gray500} />
            </Pressable>
          </View>
        </View>

        <View accessibilityLabel="Contract totals" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {stat('Work done', rupees(t.workDone), t.progress !== null ? `${Math.round(t.progress * 100)}% of ${rupees(t.value)}` : undefined)}
          {stat('Paid', rupees(t.paid))}
          {stat(
            t.balance < 0 ? 'Paid ahead of work' : t.balance > 0 ? 'Balance due' : 'Balance',
            <Text style={{ color: t.balance < 0 ? c.red600 : t.balance > 0 ? c.gray900 : c.green700 }}>{t.balance ? rupees(Math.abs(t.balance)) : 'Settled'}</Text>,
          )}
          {t.advances > 0 && stat('Advances (kharcha)', rupees(t.advances), 'in Paid')}
          {contract.retention_pct > 0 &&
            stat(
              'Retention',
              rupees(t.retention),
              contract.retention_released_at ? (
                <Text style={{ textDecorationLine: 'underline' }} onPress={() => actions.setRetentionReleased(contract.id, '')}>
                  released {contract.retention_released_at} · hold again
                </Text>
              ) : (
                <Text style={{ textDecorationLine: 'underline', color: c.orange700 }} onPress={() => actions.setRetentionReleased(contract.id, todayISO())}>
                  held · release now
                </Text>
              ),
            )}
          {t.deductions > 0 && stat('Deductions', rupees(t.deductions))}
        </View>

        {entryForm ? (
          <EntryForm contract={contract} kind={entryForm.kind} entry={entryForm.entry} onDone={() => setEntryForm(null)} />
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Button variant="primary" icon="construction" style={{ flexGrow: 1, flexBasis: '45%' }} onPress={() => setEntryForm({ kind: 'work' })}>
              Work
            </Button>
            <Button icon="volunteer-activism" style={{ flexGrow: 1, flexBasis: '45%' }} onPress={() => setEntryForm({ kind: 'advance' })}>
              Advance
            </Button>
            <Button icon="payments" style={{ flexGrow: 1, flexBasis: '45%' }} onPress={() => setEntryForm({ kind: 'payment' })}>
              Payment
            </Button>
            <Button icon="remove-circle-outline" style={{ flexGrow: 1, flexBasis: '45%' }} onPress={() => setEntryForm({ kind: 'deduction' })}>
              Deduct
            </Button>
          </View>
        )}

        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray500 }}>Entries ({entries.length})</Text>
          {listed.length === 0 ? (
            <Text style={{ fontSize: 12, color: c.gray500, paddingVertical: 12 }}>Nothing recorded yet. Add work as it is measured, each advance (kharcha) given before measuring, and each payment.</Text>
          ) : (
            <View style={{ borderWidth: 1, borderColor: c.gray100, borderRadius: 12 }}>
              {listed.map((e, i) => {
                const pending = pendingDeletes.has(e.id);
                const value = e.kind === 'work' ? workValue(contract, e) : e.amount;
                return (
                  <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: c.gray100, opacity: pending ? 0.4 : 1 }}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${KIND_LABEL[e.kind]} of ${e.date}`} disabled={pending} onPress={() => setEntryForm({ kind: e.kind, entry: e })} style={{ flex: 1, minWidth: 0, minHeight: 40, justifyContent: 'center' }}>
                      <Text numberOfLines={2} style={[{ fontSize: 12, color: c.gray800 }, pending && { textDecorationLine: 'line-through' }]}>
                        {describeEntry(contract, e)}
                      </Text>
                      <Text style={{ fontSize: 12, fontFamily: 'monospace', color: c.gray500 }}>{e.date}</Text>
                    </Pressable>
                    <Text style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: '700', color: e.kind === 'work' ? c.gray800 : isPaidOut(e.kind) ? c.green700 : c.red600 }}>
                      {e.kind === 'work' ? '+' : '−'}
                      {rupees(value)}
                    </Text>
                    {pending ? (
                      <UndoButton onUndo={() => actions.undoDelete(e.id)} label={KIND_LABEL[e.kind]} />
                    ) : (
                      <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${KIND_LABEL[e.kind]} of ${e.date}`} onPress={() => actions.deleteContractEntryLater(e.id)} style={{ minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center', marginRight: -8 }}>
                        <Icon name="delete-outline" size={16} color={c.red400} />
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {!!contract.notes && (
          <Text selectable style={{ fontSize: 12, color: c.gray600, padding: 8, borderRadius: 8, backgroundColor: c.gray50 }}>
            {contract.notes}
          </Text>
        )}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 4 }}>
          <Button icon="share" style={{ flexGrow: 1, flexBasis: '45%' }} onPress={() => setStatementOpen(true)}>
            Statement
          </Button>
          <Button icon="edit" style={{ flexGrow: 1, flexBasis: '45%' }} onPress={() => onEdit(contract)}>
            Edit terms
          </Button>
          <Button style={{ flexGrow: 1, flexBasis: '45%' }} onPress={() => (closed ? actions.setContractStatus(contract.id, 'active') : closeContract())}>
            {closed ? 'Reopen' : 'Close contract'}
          </Button>
          <Button variant="dangerOutline" icon="delete-outline" style={{ flexGrow: 1, flexBasis: '45%' }} onPress={deleteContract}>
            Delete
          </Button>
        </View>
      </Sheet>
      {statementOpen && <StatementSheet contract={contract} entries={entries} onClose={() => setStatementOpen(false)} />}
    </>
  );
}

/** Add or change one entry: work measured, a payment, or a deduction. */
function EntryForm({ contract, kind, entry, onDone }: { contract: ContractRow; kind: ContractEntryKind; entry?: ContractEntryRow; onDone(): void }) {
  const c = useColors();
  const { actions } = useAppState();
  const dialogs = useDialogs();
  const isWork = kind === 'work';
  const [date, setDate] = useState(entry?.date ?? todayISO());
  const [value, setValue] = useState(entry ? String(isWork ? entry.quantity : entry.amount) : '');
  const [mode, setMode] = useState(entry?.mode || 'cash');
  const [note, setNote] = useState(entry?.note ?? '');
  const n = value.trim() ? parseAmount(value) : null;
  const preview = isWork && n ? workValue(contract, { quantity: n }) : 0;

  const save = async () => {
    if (n === null || n <= 0) return dialogs.alert(isWork ? 'Enter the quantity done' : 'Enter the amount', value.trim() ? `“${value}” is not a number.` : undefined);
    if (!date) return dialogs.alert('Pick the date');
    await actions.saveContractEntry({ contract_id: contract.id, kind, date, quantity: isWork ? n : 0, amount: isWork ? 0 : n, mode: isPaidOut(kind) ? mode : '', note }, entry?.id);
    onDone();
  };

  const unit = contract.kind === 'rate' ? contract.unit || 'unit' : '% of job';
  return (
    <View accessibilityLabel={`${entry ? 'Edit' : 'Add'} ${KIND_LABEL[kind]}`} style={{ padding: 12, gap: 8, borderRadius: 12, borderWidth: 1, borderColor: c.orange200, backgroundColor: c.orange50 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray600 }}>
          {entry ? 'Edit' : 'Add'} {KIND_LABEL[kind].toLowerCase()}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={onDone} style={{ minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center', margin: -8 }}>
          <Icon name="close" size={16} color={c.gray500} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <NumberField label={isWork ? `Done (${unit})` : 'Amount ₹'} autoFocus value={value} onChangeText={setValue} />
        </View>
        <View style={{ flex: 1 }}>
          <DateField label="Date" value={date} onChange={setDate} />
        </View>
      </View>
      {isWork && preview > 0 && <Text style={{ fontSize: 12, color: c.gray600 }}>Worth {rupees(preview)}</Text>}
      {isPaidOut(kind) && (
        <View accessibilityLabel="Paid by" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {paymentModes.map((m) => (
            <Pressable key={m} accessibilityRole="button" accessibilityState={{ selected: mode === m }} onPress={() => setMode(m)} style={{ minHeight: 40, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 20, borderWidth: 1, borderColor: mode === m ? c.gray800 : c.gray200, backgroundColor: mode === m ? c.gray800 : c.white }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: mode === m ? c.white : c.gray500 }}>{paymentModeLabel(m)}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <TextInput
        accessibilityLabel="Entry note"
        value={note}
        onChangeText={setNote}
        placeholder={isWork ? 'e.g. Ground floor walls' : kind === 'advance' ? 'e.g. Week 3 kharcha' : kind === 'payment' ? 'e.g. Bill for ground floor' : 'e.g. Cement supplied, 10 bags'}
        placeholderTextColor={c.gray500}
        style={{ minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: c.gray200, borderRadius: 10, backgroundColor: c.white, color: c.brandDark, fontSize: 14 }}
      />
      <Button variant="primary" block onPress={save}>
        {entry ? 'Save' : 'Add'}
      </Button>
    </View>
  );
}
