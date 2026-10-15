import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from './ui/Pressable';
import { contractTermsProblem, fieldLimits, kindLockedNote, parseAmount, rateChangesLockedNote, rateOn, shortDate, todayISO, type ContractRow, type ContractWithRates } from '@nirman/shared';
import type { ContractInput } from '@nirman/core';
import { useColors } from '../theme';
import { Button } from './ui/Button';
import { useDialogs } from './ui/Dialogs';
import { Icon } from './ui/Icon';
import { Field, Label, NumberField, SuggestInput } from './ui/fields';
import { DateField, Select } from './ui/Select';
import { Sheet, SheetHeader } from './ui/Sheet';
import { rupees, rupeesWhole } from '../lib/format';

/** Common jobs, offered as suggestions; anything can be typed. */
const WORK_SUGGESTIONS = ['Masonry', 'Plaster', 'Tiling', 'Flooring', 'Plumbing', 'Electrical wiring', 'Painting', 'Carpentry', 'POP / false ceiling', 'Waterproofing', 'Fabrication', 'Shuttering', 'RCC / slab casting', 'Excavation'];
const UNIT_SUGGESTIONS = ['sqft', 'rft', 'cft', 'sqm', 'cum', 'point', 'nos', 'day'];
const LIMIT = fieldLimits('contracts');

const blank = (category: string): Record<keyof ContractInput, string> => ({
  project_id: '',
  contractor: '',
  phone: '',
  address: '',
  category,
  work: '',
  kind: 'rate',
  rate: '',
  unit: 'sqft',
  est_quantity: '',
  amount: '',
  retention_pct: '',
  start_date: todayISO(),
  notes: '',
});

/** The rate shown is the one in effect now (the latest rate change, else the contract's own rate). */
const asText = (c: ContractWithRates): Record<keyof ContractInput, string> => ({
  project_id: c.project_id,
  contractor: c.contractor,
  phone: c.phone,
  address: c.address,
  category: c.category,
  work: c.work,
  kind: c.kind,
  rate: rateOn(c) ? String(rateOn(c)) : '',
  unit: c.unit,
  est_quantity: c.est_quantity ? String(c.est_quantity) : '',
  amount: c.amount ? String(c.amount) : '',
  retention_pct: c.retention_pct ? String(c.retention_pct) : '',
  start_date: c.start_date,
  notes: c.notes,
});

/** New labour contract, or edit the terms of one. */
export function ContractForm({
  contract,
  hasWork = false,
  defaults,
  addresses,
  categories,
  contractors,
  projects,
  onSave,
  onSaveRate,
  onClose,
}: {
  contract?: ContractWithRates;
  /** The contract has work recorded: its kind stays (sqft would be read as %, or back). */
  hasWork?: boolean;
  defaults: { address: string; category: string; project_id: string };
  /** Projects it can be in (a choice is shown when there are several). */
  projects: { id: string; name: string }[];
  addresses: string[];
  categories: string[];
  /** Contractors already on file, with their phone, to fill in. */
  contractors: { name: string; phone: string }[];
  onSave(input: ContractInput): Promise<void>;
  /** Change the rate from a date (a rate change); the other terms are saved with `onSave`. */
  onSaveRate?(rate: number, fromDate: string): Promise<void>;
  onClose(): void;
}) {
  const c = useColors();
  const dialogs = useDialogs();
  const [f, setF] = useState(() => (contract ? asText(contract) : { ...blank(defaults.category), address: defaults.address, project_id: defaults.project_id }));
  const [saving, setSaving] = useState(false);
  /** The rate changed on a contract with work: the terms to save, while asking from when the new rate applies. */
  const [asking, setAsking] = useState<{ input: ContractInput; rate: number } | null>(null);
  const [fromDated, setFromDated] = useState(true);
  const [fromDate, setFromDate] = useState(todayISO);
  const set = (k: keyof ContractInput) => (value: string) => setValue(k, value);
  const setValue = (k: keyof ContractInput, value: string) => {
    setF((p) => {
      const next = { ...p, [k]: value };
      // A known contractor brings their phone number.
      if (k === 'contractor' && !p.phone) next.phone = contractors.find((x) => x.name.toLowerCase() === value.trim().toLowerCase())?.phone ?? '';
      return next;
    });
  };
  const isRate = f.kind === 'rate';
  const numbers = {
    rate: f.rate.trim() ? parseAmount(f.rate) : 0,
    est_quantity: f.est_quantity.trim() ? parseAmount(f.est_quantity) : 0,
    amount: f.amount.trim() ? parseAmount(f.amount) : 0,
    retention_pct: f.retention_pct.trim() ? parseAmount(f.retention_pct) : 0,
  };
  const preview = isRate ? (numbers.rate ?? 0) * (numbers.est_quantity ?? 0) : (numbers.amount ?? 0);

  const rateChanges = contract?.kind === 'rate' ? (contract.rates ?? []) : [];
  // A lump sum has no rate changes, so a rate contract with any keeps its kind (the note for work comes first).
  const kindLocked = !!contract && (hasWork || rateChanges.length > 0);
  const rateNow = contract ? rateOn(contract) : 0;

  const save = async () => {
    if (!f.contractor.trim()) return dialogs.alert('Enter the contractor’s name');
    const bad = Object.entries(numbers).find(([, n]) => n === null);
    if (bad) return dialogs.alert('Check the number', `“${f[bad[0] as keyof typeof f]}” is not a number. Use digits, e.g. 18 or 2,50,000.`);
    const problem = contractTermsProblem({ kind: f.kind as ContractRow['kind'], rate: numbers.rate!, amount: numbers.amount!, est_quantity: numbers.est_quantity!, retention_pct: numbers.retention_pct! });
    if (problem) return dialogs.alert(problem);
    // The rate field shows the rate in effect now; left as it was, the starting rate (and any rate changes) stay.
    const rateChanged = isRate && contract?.kind === 'rate' && numbers.rate! !== rateNow;
    const input: ContractInput = {
      project_id: f.project_id,
      contractor: f.contractor,
      phone: f.phone,
      address: f.address,
      category: f.category,
      work: f.work,
      kind: f.kind as ContractRow['kind'],
      rate: isRate ? (contract?.kind === 'rate' && !rateChanged ? contract.rate : numbers.rate!) : 0,
      unit: isRate ? f.unit : '',
      est_quantity: isRate ? numbers.est_quantity! : 0,
      amount: isRate ? 0 : numbers.amount!,
      retention_pct: numbers.retention_pct!,
      start_date: f.start_date,
      notes: f.notes,
    };
    // Work already measured (or rate changes already made): ask whether the new rate is from a date or for all of it.
    if (rateChanged && onSaveRate && (hasWork || rateChanges.length > 0)) {
      setFromDated(true);
      setFromDate(todayISO());
      setAsking({ input, rate: numbers.rate! });
      return;
    }
    await commit(input);
  };

  /** Save the terms, and the rate from a date when one was picked. */
  const commit = async (input: ContractInput, rateFrom?: { rate: number; date: string }) => {
    setSaving(true);
    try {
      if (rateFrom) await onSaveRate?.(rateFrom.rate, rateFrom.date);
      await onSave(input);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const saveAsked = async () => {
    if (!asking || !contract) return;
    if (!fromDated) return commit(asking.input);
    if (!fromDate) return dialogs.alert('Pick the date the new rate applies from');
    await commit({ ...asking.input, rate: contract.rate }, { rate: asking.rate, date: fromDate });
  };

  const choice = (dated: boolean, label: string, line: string, extra?: ReactNode) => (
    <View style={{ borderRadius: 12, borderWidth: 1, borderColor: fromDated === dated ? c.orange400 : c.gray200, backgroundColor: fromDated === dated ? c.orange50 : 'transparent', overflow: 'hidden' }}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: fromDated === dated }}
        accessibilityLabel={`${label}. ${line}`}
        onPress={() => setFromDated(dated)}
        style={{ minHeight: 48, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        <Icon name={fromDated === dated ? 'radio-button-checked' : 'radio-button-unchecked'} size={20} color={fromDated === dated ? c.orange500 : c.gray400} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: c.gray800 }}>{label}</Text>
          <Text style={{ fontSize: 12, color: c.gray600 }}>{line}</Text>
        </View>
      </Pressable>
      {fromDated === dated && extra ? <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>{extra}</View> : null}
    </View>
  );

  if (asking && contract) {
    const title = `From when does ${rupees(asking.rate)} apply?`;
    return (
      <Sheet label={title} onClose={onClose} onBack={() => setAsking(null)} busy={saving} padding={20} gap={12}>
        <SheetHeader title={title} onClose={onClose} closeDisabled={saving} />
        {choice(
          true,
          'From a date',
          `Work on or after it is paid ${rupees(asking.rate)}; earlier work keeps its rate.`,
          <DateField label="From" value={fromDate} onChange={setFromDate} />,
        )}
        {choice(false, 'All work so far', rateChanges.length ? `Work before ${shortDate(rateChanges[0].from_date)}` : 'Corrects the rate for every entry')}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button variant="ghost" style={{ flex: 1 }} disabled={saving} onPress={() => setAsking(null)}>
            Back
          </Button>
          <Button variant="primary" style={{ flex: 2 }} disabled={saving} onPress={saveAsked}>
            Save changes
          </Button>
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet label={contract ? 'Edit contract' : 'New labour contract'} onClose={onClose} busy={saving} padding={20} gap={12}>
      <SheetHeader title={contract ? 'Edit contract' : 'New labour contract'} onClose={onClose} closeDisabled={saving} />

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <SuggestInput label="Contractor" style={{ fontWeight: '700' }} value={f.contractor} onChange={(v) => setValue('contractor', v)} suggestions={contractors.map((x) => x.name)} placeholder="Name" maxLength={LIMIT.contractor} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Phone" keyboardType="phone-pad" value={f.phone} onChangeText={set('phone')} placeholder="98xxxxxxxx" maxLength={LIMIT.phone} />
        </View>
      </View>

      <SuggestInput label="Work" value={f.work} onChange={(v) => setValue('work', v)} suggestions={WORK_SUGGESTIONS} placeholder="e.g. Internal plaster, 2nd floor" maxLength={LIMIT.work} />

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <SuggestInput label="Site address" value={f.address} onChange={(v) => setValue('address', v)} suggestions={addresses} placeholder="e.g. Sector 44" maxLength={LIMIT.address} />
        </View>
        <View style={{ flex: 1 }}>
          <Select label="Work type" value={f.category} options={[...new Set([f.category, ...categories])].filter(Boolean).map((x) => ({ value: x, label: x }))} onChange={set('category')} />
        </View>
      </View>

      {projects.length > 1 && <Select label="Project" value={f.project_id} options={projects.map((p) => ({ value: p.id, label: p.name }))} onChange={set('project_id')} />}

      <View>
        <Label>Paid by</Label>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['rate', 'lump_sum'] as const).map((k) => (
            <Pressable
              key={k}
              accessibilityRole="radio"
              accessibilityState={{ checked: f.kind === k, disabled: kindLocked }}
              disabled={kindLocked}
              onPress={() => setF((p) => ({ ...p, kind: k }))}
              style={{ flex: 1, minHeight: 48, padding: 8, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: f.kind === k ? c.orange400 : c.gray200, backgroundColor: f.kind === k ? c.orange50 : 'transparent', opacity: kindLocked && f.kind !== k ? 0.5 : 1 }}
            >
              <Icon name={f.kind === k ? 'radio-button-checked' : 'radio-button-unchecked'} size={18} color={f.kind === k ? c.orange500 : c.gray400} />
              <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: c.gray800 }}>{k === 'rate' ? 'Rate (per unit of work)' : 'Lump sum (fixed amount)'}</Text>
            </Pressable>
          ))}
        </View>
        {kindLocked && contract && <Text style={{ marginTop: 4, fontSize: 12, color: c.gray500 }}>{hasWork ? kindLockedNote(contract) : rateChangesLockedNote}</Text>}
      </View>

      {isRate ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <NumberField label="Rate ₹" value={f.rate} onChangeText={set('rate')} placeholder="18" />
          </View>
          <View style={{ flex: 1 }}>
            <SuggestInput label="Per" value={f.unit} onChange={(v) => setValue('unit', v)} suggestions={UNIT_SUGGESTIONS} maxLength={LIMIT.unit} />
          </View>
          <View style={{ flex: 1 }}>
            <NumberField label="Est. qty" value={f.est_quantity} onChangeText={set('est_quantity')} placeholder="optional" />
          </View>
        </View>
      ) : (
        <NumberField label="Contract amount ₹" value={f.amount} onChangeText={set('amount')} placeholder="250000" />
      )}
      {preview > 0 && (
        <Text style={{ fontSize: 12, color: c.gray500 }}>
          Contract value {rupeesWhole(preview)}
          {isRate ? ' (estimate)' : ''}
        </Text>
      )}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <NumberField label="Retention %" value={f.retention_pct} onChangeText={set('retention_pct')} placeholder="0 (none)" />
        </View>
        <View style={{ flex: 1 }}>
          <DateField label="Start date" value={f.start_date} onChange={set('start_date')} />
        </View>
      </View>

      <Field
        label="Notes / terms"
        accessibilityLabel="Contract notes"
        multiline
        value={f.notes}
        onChangeText={set('notes')}
        placeholder="e.g. Material by us, scaffolding by contractor"
        textAlignVertical="top"
        maxLength={LIMIT.notes}
        style={{ height: 64, paddingVertical: 12, fontSize: 12 }}
      />

      <Button variant="primary" block disabled={saving} onPress={save}>
        {contract ? 'Save changes' : 'Add contract'}
      </Button>
    </Sheet>
  );
}
