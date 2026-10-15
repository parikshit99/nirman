import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { expenseKindLabel, expenseKinds, expenseProblem, fieldLimits, parseAmount, paymentModeLabel, paymentModes, todayISO, type ExpenseKind, type ExpenseRow } from '@nirman/shared';
import { FilterChips } from '../components/FilterChips';
import { TrashButton } from '../components/TrashButton';
import { UndoButton } from '../components/UndoButton';
import { Button } from '../components/ui/Button';
import { useDialogs } from '../components/ui/Dialogs';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { PressScale } from '../components/ui/PressScale';
import { Pressable } from '../components/ui/Pressable';
import { Field, Label, NumberField, SuggestInput } from '../components/ui/fields';
import { DateField } from '../components/ui/Select';
import { Sheet, SheetHeader } from '../components/ui/Sheet';
import { plural, rupees, rupeesWhole } from '../lib/format';
import { useAppState } from '../state/AppState';
import { useColors } from '../theme';

const LIMIT = fieldLimits('expenses');

/** "Rent, ₹8,000": an expense in a few words, for the Undo strip and TalkBack. */
const describeExpense = (e: ExpenseRow) => `${expenseKindLabel(e.kind)}, ${rupees(e.amount)}`;

/** The open project's expenses that are not waiting to be deleted, and what they add up to. */
function useExpenseTotals() {
  const { expenses, pendingDeletes } = useAppState();
  return useMemo(() => {
    const live = expenses.filter((e) => !pendingDeletes.has(e.id));
    return { count: live.length, total: live.reduce((n, e) => n + (e.amount || 0), 0) };
  }, [expenses, pendingDeletes]);
}

/** The card at the top of the Labour tab that opens the project's expenses. */
export function ExpensesCard({ onOpen }: { onOpen(): void }) {
  const c = useColors();
  const { count, total } = useExpenseTotals();
  const summary = count ? `${rupeesWhole(total)} · ${plural(count, 'expense')}` : 'Rent, food, transport and other costs';
  return (
    <PressScale accessibilityRole="button" accessibilityLabel={`Expenses: ${summary}`} onPress={onOpen} style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: c.brandConcrete, backgroundColor: c.white }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.orange50 }}>
        <Icon name="receipt-long" size={20} color={c.orange700} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: c.gray900 }}>Expenses</Text>
        <Text numberOfLines={1} style={{ fontSize: 12, fontVariant: ['tabular-nums'], color: c.gray600 }}>
          {summary}
        </Text>
      </View>
      <Icon name="chevron-right" size={22} color={c.gray400} />
    </PressScale>
  );
}

/** Every expense of the open project, newest first, with chips for each kind; tap one to change it. */
export function ExpensesSheet({ onClose }: { onClose(): void }) {
  const c = useColors();
  const { expenses, actions, pendingDeletes, project } = useAppState();
  const dialogs = useDialogs();
  const [filter, setFilter] = useState('All');
  /** Expense being added (none) or changed. Rendered inside this screen, or it would open behind it. */
  const [form, setForm] = useState<{ expense?: ExpenseRow } | null>(null);
  const { count, total } = useExpenseTotals();

  const chips = expenseKinds.map(expenseKindLabel).filter((label) => label === filter || expenses.some((e) => !pendingDeletes.has(e.id) && expenseKindLabel(e.kind) === label));
  const shown = filter === 'All' ? expenses : expenses.filter((e) => expenseKindLabel(e.kind) === filter);
  const shownTotal = shown.filter((e) => !pendingDeletes.has(e.id)).reduce((n, e) => n + (e.amount || 0), 0);

  const remove = (e: ExpenseRow) => {
    actions.deleteExpenseLater(e.id);
    dialogs.undoable(`Deleted the expense “${describeExpense(e)}”`, () => actions.undoDelete(e.id));
  };

  return (
    <Sheet kind="screen" label="Expenses" onClose={onClose} backEnabled={!form} gap={12}>
      <SheetHeader title="Expenses" subtitle={`Rent, food, transport and other costs${project?.name ? ` for ${project.name}` : ''}.`} onClose={onClose} />

      {count > 0 && (
        <View accessibilityLiveRegion="polite" style={{ padding: 12, borderRadius: 12, backgroundColor: c.gray50, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Text style={{ flex: 1, fontSize: 14, color: c.gray600 }}>{filter === 'All' ? plural(count, 'expense') : `${filter}: ${plural(shown.filter((e) => !pendingDeletes.has(e.id)).length, 'expense')}`}</Text>
          <Text style={{ fontVariant: ['tabular-nums'], fontWeight: '700', fontSize: 14, color: c.brandDark }}>{rupeesWhole(filter === 'All' ? total : shownTotal)}</Text>
        </View>
      )}

      <Button variant="primary" icon="add" block onPress={() => setForm({})}>
        Add expense
      </Button>

      {expenses.length > 0 && chips.length > 1 && (
        <View style={{ marginHorizontal: -16 }}>
          <FilterChips categories={chips} categoryFilter={filter} onCategory={setFilter} addresses={[]} addressFilter="All" onAddress={() => undefined} addressLabel="" />
        </View>
      )}

      {expenses.length === 0 ? (
        <EmptyState icon={require('../../assets/tabs/labour.png')} title="No expenses yet.">
          Tap Add expense to record rent, food, transport or other costs for this project.
        </EmptyState>
      ) : (
        <View style={{ borderWidth: 1, borderColor: c.gray100, borderRadius: 12 }}>
          {shown.map((e, i) => {
            const pending = pendingDeletes.has(e.id);
            const details = [e.date, e.paid_to, e.mode && paymentModeLabel(e.mode)].filter(Boolean).join(' · ');
            return (
              <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingRight: 4, paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: c.gray100, opacity: pending ? 0.4 : 1 }}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Edit expense ${describeExpense(e)}, ${details}`} disabled={pending} onPress={() => setForm({ expense: e })} style={{ flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center' }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <Text numberOfLines={1} style={[{ flexShrink: 1, fontSize: 14, fontWeight: '700', color: c.gray900 }, pending && { textDecorationLine: 'line-through' }]}>
                      {expenseKindLabel(e.kind)}
                    </Text>
                    <Text style={{ fontSize: 14, fontVariant: ['tabular-nums'], fontWeight: '700', color: c.gray800 }}>{rupees(e.amount)}</Text>
                  </View>
                  <Text numberOfLines={1} style={{ fontSize: 12, fontVariant: ['tabular-nums'], color: c.gray500 }}>
                    {details}
                  </Text>
                  {!!e.note && (
                    <Text numberOfLines={2} style={{ fontSize: 12, color: c.gray600 }}>
                      {e.note}
                    </Text>
                  )}
                </Pressable>
                {pending ? <UndoButton onUndo={() => actions.undoDelete(e.id)} label={describeExpense(e)} /> : <TrashButton name={`the expense ${describeExpense(e)}`} onPress={() => remove(e)} />}
              </View>
            );
          })}
        </View>
      )}

      {form && <ExpenseForm expense={form.expense} onClose={() => setForm(null)} />}
    </Sheet>
  );
}

/** Add an expense to the open project, or change one. A bottom sheet. */
export function ExpenseForm({ expense, onClose }: { expense?: ExpenseRow; onClose(): void }) {
  const c = useColors();
  const { actions, projectId, snapshot } = useAppState();
  const dialogs = useDialogs();
  const [kind, setKind] = useState<ExpenseKind | ''>(expense?.kind ?? '');
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '');
  const [date, setDate] = useState(expense?.date ?? todayISO());
  const [paidTo, setPaidTo] = useState(expense?.paid_to ?? '');
  const [mode, setMode] = useState(expense?.mode ?? 'cash');
  const [note, setNote] = useState(expense?.note ?? '');
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const payees = useMemo(() => [...new Set(snapshot.expenses.map((e) => e.paid_to).filter(Boolean))].sort(), [snapshot.expenses]);

  const value = amount.trim() ? (parseAmount(amount) ?? NaN) : 0;
  const problem = expenseProblem({ date, kind, amount: value, mode });
  const title = expense ? 'Edit expense' : 'Add expense';

  const save = async () => {
    setTried(true);
    if (problem || !kind) return;
    setSaving(true);
    try {
      await actions.saveExpense({ project_id: expense?.project_id ?? projectId, date, kind, amount: value, paid_to: paidTo, mode, note }, expense?.id);
      dialogs.toast(expense ? 'Expense saved' : 'Expense added');
      onClose();
    } catch (err) {
      await dialogs.alert('Could not save the expense', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const chip = (on: boolean) => ({ minHeight: 40, paddingHorizontal: 12, justifyContent: 'center' as const, borderRadius: 20, borderWidth: 1, borderColor: on ? c.gray800 : c.gray200, backgroundColor: on ? c.gray800 : c.white });
  const chipText = (on: boolean) => ({ fontSize: 14, fontWeight: '600' as const, color: on ? c.white : c.gray600 });

  return (
    <Sheet label={title} onClose={onClose} busy={saving} padding={20} gap={12}>
      <SheetHeader title={title} onClose={onClose} closeDisabled={saving} />

      <View>
        <Label>What for</Label>
        <View accessibilityRole="radiogroup" accessibilityLabel="What for" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {expenseKinds.map((k) => (
            <PressScale key={k} accessibilityRole="radio" accessibilityState={{ checked: kind === k }} onPress={() => setKind(k)} style={chip(kind === k)}>
              <Text style={chipText(kind === k)}>{expenseKindLabel(k)}</Text>
            </PressScale>
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <NumberField label="Amount ₹" value={amount} onChangeText={setAmount} placeholder="0" />
        </View>
        <View style={{ flex: 1 }}>
          <DateField label="Date" value={date} onChange={setDate} />
        </View>
      </View>

      <SuggestInput label="Paid to" value={paidTo} onChange={setPaidTo} suggestions={payees} placeholder="e.g. landlord, tractor owner (optional)" maxLength={LIMIT.paid_to} />

      <View>
        <Label>Paid by</Label>
        <View accessibilityRole="radiogroup" accessibilityLabel="Paid by" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {paymentModes.map((m) => (
            <PressScale key={m} accessibilityRole="radio" accessibilityState={{ checked: mode === m }} onPress={() => setMode(m)} style={chip(mode === m)}>
              <Text style={chipText(mode === m)}>{paymentModeLabel(m)}</Text>
            </PressScale>
          ))}
        </View>
      </View>

      <Field label="Note" value={note} onChangeText={setNote} placeholder="Optional" maxLength={LIMIT.note} />

      {tried && problem && (
        <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{ fontSize: 14, fontWeight: '600', color: c.red600 }}>
          {problem}
        </Text>
      )}

      <Button variant="primary" block disabled={saving} onPress={save}>
        {expense ? 'Save changes' : 'Add expense'}
      </Button>
    </Sheet>
  );
}
