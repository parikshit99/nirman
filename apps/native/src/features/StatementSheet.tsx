import { useState } from 'react';
import { Text, View } from 'react-native';
import { contractStatement, todayISO, type ContractEntryRow, type ContractRow } from '@nirman/shared';
import { logStep, contractStatementSheet, pdfFile, type ExportFormat, buildContractStatementPdf } from '@nirman/core';
import { DocumentPreview } from '../components/DocumentPreview';
import { Button } from '../components/ui/Button';
import { useDialogs } from '../components/ui/Dialogs';
import type { IconName } from '../components/ui/Icon';
import { DateField } from '../components/ui/Select';
import { Sheet, SheetHeader } from '../components/ui/Sheet';
import { pdfToJpegs, sheetToXlsx } from '../lib/exportFiles';
import { shareFiles } from '../lib/files';
import { useColors } from '../theme';

const FORMATS: { format: ExportFormat; label: string; icon: IconName }[] = [
  { format: 'pdf', label: 'PDF', icon: 'picture-as-pdf' },
  { format: 'xlsx', label: 'Excel', icon: 'table-chart' },
  { format: 'jpg', label: 'JPG', icon: 'image' },
];

/** The contractor's account: terms, every entry with a running balance, and what is due. Optionally for a period. */
export function StatementSheet({ contract, entries, onClose }: { contract: ContractRow; entries: ContractEntryRow[]; onClose(): void }) {
  const c = useColors();
  const dialogs = useDialogs();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const periodLabel = () => (from || to ? `${from || 'start'} to ${to || todayISO()}` : '');
  const share = async (format: ExportFormat) => {
    setBusy(format);
    const statement = contractStatement(contract, entries, { from, to });
    logStep('share', { what: 'labour statement', format, lines: statement.rows.length, dated: !!(from || to) });
    const name = `Statement_${contract.contractor.replace(/[^\w-]+/g, '_').slice(0, 30)}_${todayISO()}`;
    const period = periodLabel();
    try {
      if (format === 'xlsx') {
        await shareFiles([await sheetToXlsx(contractStatementSheet(contract, statement, period), `${name}.xlsx`, 'Statement', [12, 44, 14, 14, 14, 14])]);
      } else {
        const doc = buildContractStatementPdf(contract, statement, period);
        await shareFiles(format === 'pdf' ? [pdfFile(doc, name)] : await pdfToJpegs(doc, name));
      }
      onClose();
    } catch (err) {
      await dialogs.alert('Could not create the statement', (err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet label="Statement" onClose={onClose} busy={!!busy} padding={20}>
      <SheetHeader title="Statement" subtitle={`For ${contract.contractor}: terms, work, payments and deductions with the balance due.`} onClose={onClose} closeDisabled={!!busy} />
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray600 }}>Period (blank = everything)</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <DateField label="From" value={from} onChange={setFrom} max={to || undefined} />
          </View>
          <View style={{ flex: 1 }}>
            <DateField label="To" value={to} onChange={setTo} />
          </View>
        </View>
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
          title={`Statement for ${contract.contractor}`}
          build={() => buildContractStatementPdf(contract, contractStatement(contract, entries, { from, to }), periodLabel())}
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
