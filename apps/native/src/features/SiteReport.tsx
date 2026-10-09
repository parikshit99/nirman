import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { buildLabourReport, buildSiteReport, financialYear, siteHasDeliveries, todayISO } from '@nirman/shared';
import { pdfFile, siteReportSheet, type ExportFormat, buildSiteReportPdf, logStep } from '@nirman/core';
import { DocumentPreview } from '../components/DocumentPreview';
import { ShareSheet } from '../components/ShareSheet';
import { Button } from '../components/ui/Button';
import { useDialogs } from '../components/ui/Dialogs';
import { Icon } from '../components/ui/Icon';
import { DateField } from '../components/ui/Select';
import { Sheet, SheetHeader } from '../components/ui/Sheet';
import { pdfToJpegs, sheetToXlsx } from '../lib/exportFiles';
import { shareFiles } from '../lib/files';
import { plural } from '../lib/format';
import { useAppState } from '../state/AppState';
import { useColors } from '../theme';

const rupees = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

/** Everything bought (or delivered) for the open project, for any period and work types, as PDF / Excel / JPG. */
export function SiteReport({ onClose }: { onClose(): void }) {
  const c = useColors();
  const { snapshot, learning, categoryNames, project, projectId, contracts } = useAppState();
  const dialogs = useDialogs();
  const lists = useMemo(() => snapshot.lists.filter((l) => l.project_id === projectId && l.kind === 'audit' && l.status === 'saved'), [snapshot.lists, projectId]);
  /** The report's heading: the project, and its site address when that says more. */
  const address = [project?.name, project?.address].filter((v, i, all) => v && all.indexOf(v) === i).join(', ');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [deliveredOnly, setDeliveredOnly] = useState(() => siteHasDeliveries(lists, snapshot.items));
  const [sharing, setSharing] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const toggleCategory = (x: string) => setCategories((prev) => (prev.includes(x) ? prev.filter((y) => y !== x) : [...prev, x]));
  const siteCategories = useMemo(() => {
    const used = new Set([...lists.map((l) => l.category || 'Uncategorised'), ...contracts.map((x) => x.category || 'Uncategorised')]);
    return [...categoryNames.filter((x) => used.has(x)), ...[...used].filter((x) => !categoryNames.includes(x))];
  }, [lists, contracts, categoryNames]);

  const report = useMemo(() => buildSiteReport(lists, snapshot.items, learning, { from, to, categories, deliveredOnly }), [lists, snapshot.items, learning, from, to, categories, deliveredOnly]);
  const labour = useMemo(() => buildLabourReport(contracts, snapshot.contractEntries, { from, to, categories }), [contracts, snapshot.contractEntries, from, to, categories]);
  const empty = report.lineCount === 0 && labour.rows.length === 0;
  const materialCount = report.categories.reduce((n, x) => n + x.materials.length, 0);
  const period = from || to ? `${from || 'start'} to ${to || 'today'}` : 'All time';
  const filters = [period, categories.length ? categories.join(', ') : 'All categories', deliveredOnly ? 'Delivered only' : 'All saved purchases'].join(' · ');

  const share = async (format: ExportFormat) => {
    logStep('share', { what: 'site report', format, lines: report.lineCount, contracts: labour.rows.length, deliveredOnly, categories: categories.length, dated: !!(from || to) });
    const name = `Site_report_${address.replace(/[^\w-]+/g, '_').slice(0, 40)}_${todayISO()}`;
    try {
      if (format === 'xlsx') {
        await shareFiles([await sheetToXlsx(siteReportSheet(address, filters, report, labour), `${name}.xlsx`, 'Site report', [16, 30, 12, 12, 12, 14, 24, 10, 8, 26, 12, 14, 18, 20, 14])]);
      } else {
        const doc = buildSiteReportPdf(address, filters, report, labour);
        await shareFiles(format === 'pdf' ? [pdfFile(doc, name)] : await pdfToJpegs(doc, name));
      }
    } catch (err) {
      await dialogs.alert('Could not create the report', (err as Error).message);
    }
  };

  const chip = (on: boolean) => ({ minHeight: 40, paddingHorizontal: 12, justifyContent: 'center' as const, borderRadius: 20, borderWidth: 1, borderColor: on ? c.orange500 : c.gray200, backgroundColor: on ? c.orange500 : c.white });
  const chipText = (on: boolean) => ({ fontSize: 12, fontWeight: '700' as const, letterSpacing: 0.4, textTransform: 'uppercase' as const, color: on ? c.onPrimary : c.gray500 });
  const label = { fontSize: 12, fontWeight: '700' as const, color: c.gray600, marginBottom: 4 };
  const panel = { padding: 12, borderRadius: 12, backgroundColor: c.gray50, flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 8 };

  return (
    <>
      <Sheet kind="screen" label="Site report" onClose={onClose} backEnabled={!sharing && !previewing} padding={20} gap={16}>
        <SheetHeader title="Site report" subtitle="Everything bought for this project, grouped by work type and material, with every line listed, plus labour contracts." onClose={onClose} />

        {lists.length === 0 && contracts.length === 0 ? (
          <Text style={{ fontSize: 14, color: c.gray500 }}>Save a purchase list or add a labour contract in this project first.</Text>
        ) : (
          <View style={{ gap: 16 }}>
            <View style={{ padding: 12, borderRadius: 12, backgroundColor: c.gray50 }}>
              <Text style={label}>Project</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.gray900 }}>{address}</Text>
            </View>

            <View>
              <Text style={label}>Period</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <DateField label="From" value={from} onChange={setFrom} max={to || undefined} />
                </View>
                <View style={{ flex: 1 }}>
                  <DateField label="To" value={to} onChange={setTo} />
                </View>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                <Pressable accessibilityRole="button" style={chip(!from && !to)} onPress={() => { setFrom(''); setTo(''); }}>
                  <Text style={chipText(!from && !to)}>All time</Text>
                </Pressable>
                {[false, true].map((previous) => {
                  const fy = financialYear(todayISO(), previous);
                  const on = from === fy.from && to === fy.to;
                  return (
                    <Pressable key={String(previous)} accessibilityRole="button" style={chip(on)} onPress={() => { setFrom(fy.from); setTo(fy.to); }}>
                      <Text style={chipText(on)}>
                        {previous ? 'Last FY' : 'This FY'} {fy.from.slice(2, 4)}-{fy.to.slice(2, 4)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View>
              <Text style={label}>Work type</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Pressable accessibilityRole="button" style={chip(categories.length === 0)} onPress={() => setCategories([])}>
                  <Text style={chipText(categories.length === 0)}>All</Text>
                </Pressable>
                {siteCategories.map((x) => (
                  <Pressable key={x} accessibilityRole="button" accessibilityState={{ selected: categories.includes(x) }} style={chip(categories.includes(x))} onPress={() => toggleCategory(x)}>
                    <Text style={chipText(categories.includes(x))}>{x}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View>
              <Text style={label}>Include</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[true, false].map((d) => (
                  <Pressable key={String(d)} accessibilityRole="radio" accessibilityState={{ checked: deliveredOnly === d }} onPress={() => setDeliveredOnly(d)} style={{ flex: 1, minHeight: 48, padding: 8, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: deliveredOnly === d ? c.orange400 : c.gray200, backgroundColor: deliveredOnly === d ? c.orange50 : 'transparent' }}>
                    <Icon name={deliveredOnly === d ? 'radio-button-checked' : 'radio-button-unchecked'} size={18} color={deliveredOnly === d ? c.orange500 : c.gray400} />
                    <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: c.gray800 }}>{d ? 'Only lines marked delivered' : 'All saved purchases'}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View accessibilityLiveRegion="polite" style={panel}>
              <Text style={{ fontSize: 14, color: c.gray600 }}>
                {plural(report.lineCount, 'line')} · {plural(materialCount, 'material')}
              </Text>
              <Text style={{ fontFamily: 'monospace', fontWeight: '700', fontSize: 14, color: c.brandDark }}>{rupees(report.total)}</Text>
            </View>
            {labour.rows.length > 0 && (
              <View style={panel}>
                <Text style={{ flex: 1, fontSize: 14, color: c.gray600 }}>
                  Labour: {plural(labour.rows.length, 'contract')} · paid {rupees(labour.paid)}
                </Text>
                <Text style={{ fontFamily: 'monospace', fontWeight: '700', fontSize: 14, color: c.brandDark }}>{rupees(labour.workDone)}</Text>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button icon="visibility" style={{ flex: 1 }} disabled={empty} onPress={() => setPreviewing(true)}>
                Preview
              </Button>
              <Button variant="primary" icon="share" style={{ flex: 1 }} disabled={empty} onPress={() => setSharing(true)}>
                Share
              </Button>
            </View>
            {empty && <Text style={{ fontSize: 12, color: c.gray500, textAlign: 'center' }}>Nothing matches.{deliveredOnly ? ' Tick deliveries in Saved → Deliveries, or include all saved purchases.' : ''}</Text>}
          </View>
        )}
      </Sheet>
      {previewing && (
        <DocumentPreview
          title={`Site report: ${address}`}
          build={() => buildSiteReportPdf(address, filters, report, labour)}
          onShare={() => {
            setPreviewing(false);
            setSharing(true);
          }}
          shareLabel="Share"
          onClose={() => setPreviewing(false)}
        />
      )}
      {sharing && <ShareSheet title="site report" onShare={share} preview={() => buildSiteReportPdf(address, filters, report, labour)} onClose={() => setSharing(false)} />}
    </>
  );
}

const SiteReportContext = createContext<{ open(): void } | null>(null);

/** The site report screen for every tab: `useSiteReport().open()`. */
export function SiteReportHost({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <SiteReportContext.Provider value={{ open: () => setOpen(true) }}>
      {children}
      {open && <SiteReport onClose={() => setOpen(false)} />}
    </SiteReportContext.Provider>
  );
}

export function useSiteReport() {
  const ctx = useContext(SiteReportContext);
  if (!ctx) throw new Error('useSiteReport outside SiteReportHost');
  return ctx;
}
