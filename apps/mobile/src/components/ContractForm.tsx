import { useState } from 'react';
import { parseAmount, todayISO, type ContractRow } from '@nirman/shared';
import type { ContractInput } from '../data/repo.ts';
import { useDialogs } from './Dialogs.tsx';
import { Button } from './ui/Button.tsx';
import { Sheet, SheetHeader } from './ui/Sheet.tsx';

/** Common jobs, offered as suggestions; anything can be typed. */
const WORK_SUGGESTIONS = [
  'Masonry',
  'Plaster',
  'Tiling',
  'Flooring',
  'Plumbing',
  'Electrical wiring',
  'Painting',
  'Carpentry',
  'POP / false ceiling',
  'Waterproofing',
  'Fabrication',
  'Shuttering',
  'RCC / slab casting',
  'Excavation',
];
const UNIT_SUGGESTIONS = ['sqft', 'rft', 'cft', 'sqm', 'cum', 'point', 'nos', 'day'];

const blank = (category: string): Record<keyof ContractInput, string> => ({
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
  onSave,
  onClose,
}: {
  contract?: ContractRow;
  defaults: { address: string; category: string };
  addresses: string[];
  categories: string[];
  /** Contractors already on file, with their phone, to fill in. */
  contractors: { name: string; phone: string }[];
  onSave(input: ContractInput): Promise<void>;
  onClose(): void;
}) {
  const dialogs = useDialogs();
  const [f, setF] = useState(() => (contract ? asText(contract) : { ...blank(defaults.category), address: defaults.address }));
  const [saving, setSaving] = useState(false);
  const set = (k: keyof ContractInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = e.target.value;
    setF((p) => {
      const next = { ...p, [k]: value };
      // A known contractor brings their phone number.
      if (k === 'contractor' && !p.phone) next.phone = contractors.find((c) => c.name.toLowerCase() === value.trim().toLowerCase())?.phone ?? '';
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
  const preview = isRate ? (numbers.rate ?? 0) * (numbers.est_quantity ?? 0) : numbers.amount ?? 0;

  const save = async () => {
    if (!f.contractor.trim()) return dialogs.alert('Enter the contractor’s name');
    const bad = Object.entries(numbers).find(([, n]) => n === null);
    if (bad) return dialogs.alert('Check the number', `“${f[bad[0] as keyof typeof f]}” is not a number. Use digits, e.g. 18 or 2,50,000.`);
    if (isRate ? !numbers.rate : !numbers.amount) return dialogs.alert(isRate ? 'Enter the rate per unit' : 'Enter the contract amount');
    if ((numbers.retention_pct ?? 0) > 50) return dialogs.alert('Retention is a percentage', 'Usually 5–10%.');
    setSaving(true);
    try {
      await onSave({
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

  const label = 'text-[11px] font-mono uppercase tracking-widest text-gray-400 font-bold block mb-1';
  const input = 'w-full min-w-0 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-1 focus:ring-orange-400';
  const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

  return (
    <Sheet labelledBy="contract-form-title" onClose={onClose} busy={saving} className="p-5 space-y-3">
      <SheetHeader id="contract-form-title" title={contract ? 'Edit contract' : 'New labour contract'} onClose={onClose} closeDisabled={saving} />

      <div className="grid grid-cols-2 gap-2">
        <label className="block min-w-0">
          <span className={label}>Contractor</span>
          <input aria-label="Contractor" list="contract-contractors" value={f.contractor} onChange={set('contractor')} className={`${input} font-bold`} placeholder="Name" />
          <datalist id="contract-contractors">
            {contractors.map((c) => (
              <option key={c.name} value={c.name} />
            ))}
          </datalist>
        </label>
        <label className="block min-w-0">
          <span className={label}>Phone</span>
          <input type="tel" inputMode="tel" aria-label="Contractor phone" value={f.phone} onChange={set('phone')} className={input} placeholder="98xxxxxxxx" />
        </label>
      </div>

      <label className="block">
        <span className={label}>Work</span>
        <input aria-label="Work" list="contract-work" value={f.work} onChange={set('work')} className={input} placeholder="e.g. Internal plaster, 2nd floor" />
        <datalist id="contract-work">
          {WORK_SUGGESTIONS.map((w) => (
            <option key={w} value={w} />
          ))}
        </datalist>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block min-w-0">
          <span className={label}>Site address</span>
          <input aria-label="Site address" list="contract-sites" value={f.address} onChange={set('address')} className={input} placeholder="e.g. Sector 44" />
          <datalist id="contract-sites">
            {addresses.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </label>
        <label className="block min-w-0">
          <span className={label}>Category</span>
          <select aria-label="Category" value={f.category} onChange={set('category')} className={input}>
            {[...new Set([f.category, ...categories])].filter(Boolean).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>

      <fieldset>
        <legend className={label}>Paid by</legend>
        <div className="grid grid-cols-2 gap-2">
          {(['rate', 'lump_sum'] as const).map((k) => (
              <label key={k} className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-bold cursor-pointer ${f.kind === k ? 'border-orange-400 bg-orange-50' : 'border-gray-200'}`}>
              <input type="radio" name="contract-kind" checked={f.kind === k} onChange={() => setF((p) => ({ ...p, kind: k }))} />
              {k === 'rate' ? 'Rate (per unit of work)' : 'Lump sum (fixed amount)'}
            </label>
          ))}
        </div>
      </fieldset>

      {isRate ? (
        <div className="grid grid-cols-3 gap-2">
          <label className="block min-w-0">
            <span className={label}>Rate ₹</span>
            <input aria-label="Rate" inputMode="decimal" value={f.rate} onChange={set('rate')} className={`${input} font-mono`} placeholder="18" />
          </label>
          <label className="block min-w-0">
            <span className={label}>Per</span>
            <input aria-label="Unit" list="contract-units" value={f.unit} onChange={set('unit')} className={input} />
            <datalist id="contract-units">
              {UNIT_SUGGESTIONS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </label>
          <label className="block min-w-0">
            <span className={label}>Est. qty</span>
              <input aria-label="Estimated quantity" inputMode="decimal" value={f.est_quantity} onChange={set('est_quantity')} className={`${input} font-mono`} placeholder="optional" />
          </label>
        </div>
      ) : (
        <label className="block">
          <span className={label}>Contract amount ₹</span>
          <input aria-label="Contract amount" inputMode="decimal" value={f.amount} onChange={set('amount')} className={`${input} font-mono`} placeholder="250000" />
        </label>
      )}
      {preview > 0 && <p className="text-xs text-gray-500">Contract value {money(preview)}{isRate ? ' (estimate)' : ''}</p>}

      <div className="grid grid-cols-2 gap-2">
        <label className="block min-w-0">
          <span className={label}>Retention %</span>
            <input aria-label="Retention percent" inputMode="decimal" value={f.retention_pct} onChange={set('retention_pct')} className={`${input} font-mono`} placeholder="0 (none)" />
        </label>
        <label className="block min-w-0">
          <span className={label}>Start date</span>
          <input type="date" aria-label="Start date" value={f.start_date} onChange={set('start_date')} className={input} />
        </label>
      </div>

      <label className="block">
        <span className={label}>Notes / terms</span>
          <textarea aria-label="Contract notes" value={f.notes} onChange={set('notes')} className={`${input} h-16 resize-none text-xs`} placeholder="e.g. Material by us, scaffolding by contractor" />
      </label>

      <Button variant="primary" block onClick={save} disabled={saving}>
        {contract ? 'Save changes' : 'Add contract'}
      </Button>
    </Sheet>
  );
}
