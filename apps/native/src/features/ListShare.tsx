import { useState } from 'react';
import { todayISO, type ItemRow } from '@nirman/shared';
import { buildPdf, listSheet, logStep, pdfFile, type ExportFormat, type ListKind } from '@nirman/core';
import { ShareSheet } from '../components/ShareSheet';
import { useDialogs } from '../components/ui/Dialogs';
import { pdfToJpegs, sheetToXlsx } from '../lib/exportFiles';
import { shareFiles } from '../lib/files';
import { useAppState } from '../state/AppState';
import { BoqShareChoice, OrderSlipSheet } from './OrderSlipSheet';

const titlePrefix = (k: ListKind) => (k === 'audit' ? 'Purchases' : 'BOQ');

/**
 * Sharing a purchase list or BOQ, the open one or a saved one: a BOQ first asks "for quotes or as an order slip", a
 * purchase list goes straight to the formats (PDF, Excel, JPG).
 */
export function ListShare({ kind, items, notes, address, onClose }: { kind: ListKind; items: ItemRow[]; notes: string; address: string; onClose(): void }) {
  const dialogs = useDialogs();
  const { uniqueAddresses } = useAppState();
  const [step, setStep] = useState<'choice' | 'formats' | 'order'>(kind === 'boq' ? 'choice' : 'formats');

  const share = async (format: ExportFormat) => {
    logStep('share', { what: kind, format, lines: items.length });
    const name = `${titlePrefix(kind)}_${todayISO()}_${Date.now() % 100000}`;
    try {
      if (format === 'xlsx') {
        await shareFiles([await sheetToXlsx(listSheet(kind, items, notes), `${name}.xlsx`, kind === 'audit' ? 'Purchases' : 'BOQ', [5, 30, 14, 14, 14, 10, 8, 8, 26, 12, 14, 20, 12])]);
      } else {
        const doc = buildPdf(kind, items, notes);
        await shareFiles(format === 'pdf' ? [pdfFile(doc, name)] : await pdfToJpegs(doc, name));
      }
    } catch (err) {
      await dialogs.alert('Could not create the file', (err as Error).message);
    }
  };

  if (step === 'choice') return <BoqShareChoice onClose={onClose} onPick={(choice) => setStep(choice === 'order' ? 'order' : 'formats')} />;
  if (step === 'order') return <OrderSlipSheet items={items} notes={notes} address={address} addresses={uniqueAddresses} onClose={onClose} />;
  return <ShareSheet title={kind === 'audit' ? 'purchase list' : 'BOQ'} onShare={share} preview={() => buildPdf(kind, items, notes)} onClose={onClose} />;
}
