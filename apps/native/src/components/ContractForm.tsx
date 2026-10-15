import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Pressable } from './ui/Pressable';
import { contractTrade, parseAmount, todayISO, type ContractRow } from '@nirman/shared';
import type { ContractInput } from '@nirman/core';
import { useColors } from '../theme';
import { Button } from './ui/Button';
import { useDialogs } from './ui/Dialogs';
import { Icon } from './ui/Icon';
import { Field, Label, NumberField, SuggestInput } from './ui/fields';
import { DateField, Select } from './ui/Select';
import { Sheet, SheetHeader } from './ui/Sheet';
import { rupeesWhole } from '../lib/format';

/** Common jobs, offered as suggestions; anything can be typed. */
const WORK_SUGGESTIONS = ['Masonry', 'Plaster', 'Tiling', 'Flooring', 'Plumbing', 'Electrical wiring', 'Painting', 'Carpentry', 'POP / false ceiling', 'Waterproofing', 'Fabrication', 'Shuttering', 'RCC / slab casting', 'Excavation'];
const UNIT_SUGGESTIONS = ['sqft', 'rft', 'cft', 'sqm', 'cum', 'point', 'nos', 'day'];

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

const asText = (c: ContractRow): Record<keyof ContractInput, string> => ({
  project_id: c.project_id,
  contractor: c.contractor,
  phone: c.phone,
  address: c.address,
  category: c.category,
  work: c.work,
  kind: c.kind,
  rate: c.rate ? String(c.rate) : '',
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
  defaults,
  addresses,
  categories,
  contractors,
  projects,
  onSave,
  onClose,
}: {
  contract?: ContractRow;
  defaults: { address: string; category: string; project_id: string };
  /** Projects it can be in (a choice is shown when there are several). */
  projects: { id: string; name: string }[];
  addresses: string[];
  categories: string[];
  /** Contractors already on file, with their phone, to fill in. */
  contractors: { name: string; phone: string }[];
  onSave(input: ContractInput): Promise<void>;
  onClose(): void;
}) {
  const c = useColors();
  const dialogs = useDialogs();
  const [f, setF] = useState(() => (contract ? asText(contract) : { ...blank(defaults.category), address: defaults.address, project_id: defaults.project_id }));
  const [saving, setSaving] = useState(false);
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

  const save = async () => {
    if (!f.contractor.trim()) return dialogs.alert('Enter the contractor’s name');
    const bad = Object.entries(numbers).find(([, n]) => n === null);
    if (bad) return dialogs.alert('Check the number', `“${f[bad[0] as keyof typeof f]}” is not a number. Use digits, e.g. 18 or 2,50,000.`);
    if (isRate ? !numbers.rate : !numbers.amount) return dialogs.alert(isRate ? 'Enter the rate per unit' : 'Enter the contract amount');
    if ((numbers.retention_pct ?? 0) > 50) return dialogs.alert('Retention is a percentage', 'Usually 5–10%.');
    setSaving(true);
    try {
      await onSave({
        project_id: f.project_id,
        contractor: f.contractor,
        phone: f.phone,
        address: f.address,
        category: f.category,
        work: f.work,
        kind: f.kind as ContractRow['kind'],
        rate: isRate ? numbers.rate! : 0,
        unit: isRate ? f.unit : '',
        est_quantity: isRate ? numbers.est_quantity! : 0,
        amount: isRate ? 0 : numbers.amount!,
        retention_pct: numbers.retention_pct!,
        start_date: f.start_date,
        notes: f.notes,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };


  return (
    <Sheet label={contract ? 'Edit contract' : 'New labour contract'} onClose={onClose} busy={saving} padding={20} gap={12}>
      <SheetHeader title={contract ? 'Edit contract' : 'New labour contract'} onClose={onClose} closeDisabled={saving} />

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <SuggestInput label="Contractor" style={{ fontWeight: '700' }} value={f.contractor} onChange={(v) => setValue('contractor', v)} suggestions={contractors.map((x) => x.name)} placeholder="Name" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Phone" keyboardType="phone-pad" value={f.phone} onChangeText={set('phone')} placeholder="98xxxxxxxx" />
        </View>
      </View>

      <View style={{ gap: 4 }}>
        <SuggestInput label="Work" value={f.work} onChange={(v) => setValue('work', v)} suggestions={WORK_SUGGESTIONS} placeholder="e.g. Internal plaster, 2nd floor" />
        {/* Where its rate will show in Rates → Labour; a lump sum has no rate per unit, so it isn't there. */}
        {isRate && <Text style={{ fontSize: 12, color: c.gray500 }}>In Labour rates as: {contractTrade(f)}</Text>}
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <SuggestInput label="Site address" value={f.address} onChange={(v) => setValue('address', v)} suggestions={addresses} placeholder="e.g. Sector 44" />
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
            <Pressable key={k} accessibilityRole="radio" accessibilityState={{ checked: f.kind === k }} onPress={() => setF((p) => ({ ...p, kind: k }))} style={{ flex: 1, minHeight: 48, padding: 8, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: f.kind === k ? c.orange400 : c.gray200, backgroundColor: f.kind === k ? c.orange50 : 'transparent' }}>
              <Icon name={f.kind === k ? 'radio-button-checked' : 'radio-button-unchecked'} size={18} color={f.kind === k ? c.orange500 : c.gray400} />
              <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: c.gray800 }}>{k === 'rate' ? 'Rate (per unit of work)' : 'Lump sum (fixed amount)'}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {isRate ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <NumberField label="Rate ₹" value={f.rate} onChangeText={set('rate')} placeholder="18" />
          </View>
          <View style={{ flex: 1 }}>
            <SuggestInput label="Per" value={f.unit} onChange={(v) => setValue('unit', v)} suggestions={UNIT_SUGGESTIONS} />
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

      <View>
        <Label>Notes / terms</Label>
        <TextInput
          accessibilityLabel="Contract notes"
          multiline
          value={f.notes}
          onChangeText={set('notes')}
          placeholder="e.g. Material by us, scaffolding by contractor"
          placeholderTextColor={c.gray500}
          textAlignVertical="top"
          style={{ height: 64, padding: 12, borderWidth: 1, borderColor: c.gray200, borderRadius: 10, backgroundColor: c.white, color: c.brandDark, fontSize: 12 }}
        />
      </View>

      <Button variant="primary" block disabled={saving} onPress={save}>
        {contract ? 'Save changes' : 'Add contract'}
      </Button>
    </Sheet>
  );
}
