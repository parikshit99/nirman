import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { todayISO, type ItemRow } from '@nirman/shared';
import { orderSlipSheet, pdfFile, type ExportFormat, buildOrderSlipPdf, type OrderSlipDetails, prefs, logStep } from '@nirman/core';
import { DocumentPreview } from '../components/DocumentPreview';
import { Button } from '../components/ui/Button';
import { useDialogs } from '../components/ui/Dialogs';
import type { IconName } from '../components/ui/Icon';
import { Field, Label, SuggestInput } from '../components/ui/fields';
import { DateField } from '../components/ui/Select';
import { Sheet, SheetHeader, SheetLabel, SheetOption } from '../components/ui/Sheet';
import { pdfToJpegs, sheetToXlsx } from '../lib/exportFiles';
import { shareFiles } from '../lib/files';
import { plural } from '../lib/format';
import { useColors } from '../theme';

const LAST_KEY = 'nirmaan_order_slip';

const FORMATS: { format: ExportFormat; label: string; icon: IconName }[] = [
  { format: 'pdf', label: 'PDF', icon: 'picture-as-pdf' },
  { format: 'xlsx', label: 'Excel', icon: 'table-chart' },
  { format: 'jpg', label: 'JPG', icon: 'image' },
];

/**
 * An order to send a vendor from the open BOQ: items and quantities without rates, plus where, when and to whom to
 * deliver. The site and receiver are remembered for next time.
 */
export function OrderSlipSheet({ items, notes, address, addresses, vendor = '', onClose }: { items: ItemRow[]; notes: string; address: string; addresses: string[]; vendor?: string; onClose(): void }) {
  const c = useColors();
  const dialogs = useDialogs();
  const last = prefs.get<Partial<OrderSlipDetails>>(LAST_KEY, {});
  const [details, setDetails] = useState<OrderSlipDetails>({
    vendor,
    address: address || last.address || '',
    deliveryDate: '',
    receiverName: last.receiverName ?? '',
    receiverPhone: last.receiverPhone ?? '',
    notes,
  });
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const set = (k: keyof OrderSlipDetails) => (value: string) => setDetails((d) => ({ ...d, [k]: value }));

  const share = async (format: ExportFormat) => {
    setBusy(format);
    logStep('share', { what: 'order slip', format, lines: items.length, toVendor: !!details.vendor?.trim() });
    prefs.set(LAST_KEY, { address: details.address, receiverName: details.receiverName, receiverPhone: details.receiverPhone });
    const name = `Order_slip_${(details.vendor?.trim() || details.address || 'site').replace(/[^\w-]+/g, '_').slice(0, 30)}_${todayISO()}`;
    try {
      if (format === 'xlsx') {
        await shareFiles([await sheetToXlsx(orderSlipSheet(items, details), `${name}.xlsx`, 'Order slip', [14, 32, 14, 14, 14, 10, 8, 8, 30])]);
      } else {
        const doc = buildOrderSlipPdf(items, details);
        await shareFiles(format === 'pdf' ? [pdfFile(doc, name)] : await pdfToJpegs(doc, name));
      }
      onClose();
    } catch (err) {
      await dialogs.alert('Could not create the order slip', (err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet label="Order slip" onClose={onClose} busy={!!busy} padding={20}>
      <SheetHeader title="Order slip" subtitle={`${plural(items.length, 'item')} with quantities and sizes, no rates.`} onClose={onClose} closeDisabled={!!busy} />
      <Field label="To (vendor, optional)" value={details.vendor ?? ''} onChangeText={set('vendor')} placeholder="e.g. Sharma Traders" />
      <SuggestInput label="Deliver to (site address)" value={details.address} onChange={set('address')} suggestions={addresses} placeholder="e.g. Sector 44, Gurgaon" />
      <DateField label="Delivery date" value={details.deliveryDate} onChange={set('deliveryDate')} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Field label="Receiver" value={details.receiverName} onChangeText={set('receiverName')} placeholder="Name" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Phone" keyboardType="phone-pad" value={details.receiverPhone} onChangeText={set('receiverPhone')} placeholder="98xxxxxxxx" />
        </View>
      </View>
      <View>
        <Label>Specifications / notes</Label>
        <TextInput accessibilityLabel="Order notes" multiline value={details.notes} onChangeText={set('notes')} textAlignVertical="top" style={{ height: 80, padding: 12, borderWidth: 1, borderColor: c.gray200, borderRadius: 10, backgroundColor: c.white, color: c.brandDark, fontSize: 12 }} />
      </View>
      <Button block icon="visibility" disabled={!!busy} onPress={() => setPreviewing(true)}>
        Preview
      </Button>
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray600 }}>Share as</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {FORMATS.map(({ format, label, icon }) => (
            <Button key={format} variant="primary" icon={busy === format ? 'hourglass-empty' : icon} style={{ flex: 1 }} disabled={!!busy} onPress={() => share(format)}>
              {label}
            </Button>
          ))}
        </View>
      </View>
      {previewing && (
        <DocumentPreview
          title="Order slip"
          build={() => buildOrderSlipPdf(items, details)}
          onShare={() => {
            setPreviewing(false);
            void share('pdf');
          }}
          onClose={() => setPreviewing(false)}
        />
      )}
    </Sheet>
  );
}

/** For a BOQ: share it for quotes (rates blank) or as an order slip. */
export function BoqShareChoice({ onPick, onClose }: { onPick(choice: 'boq' | 'order'): void; onClose(): void }) {
  return (
    <Sheet label="Share BOQ" onClose={onClose} closeOnBackdrop gap={8}>
      <SheetLabel>What do you want to send?</SheetLabel>
      <SheetOption icon="picture-as-pdf" label="BOQ for quotes" about="Rate and total left blank for vendors to fill in" onPress={() => onPick('boq')} />
      <SheetOption icon="table-chart" label="Order slip" about="Place the order: items and quantities, delivery address, date and receiver" onPress={() => onPick('order')} />
      <Button variant="ghost" block onPress={onClose}>
        Cancel
      </Button>
    </Sheet>
  );
}
