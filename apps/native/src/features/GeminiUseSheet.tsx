import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { geminiUsageDays, geminiUsageMonths, onGeminiUsage, usageDayText, usageMonthText, usageSummary, type UsageCounts } from '@nirman/core';
import { Button } from '../components/ui/Button';
import { useDialogs } from '../components/ui/Dialogs';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { Pressable } from '../components/ui/Pressable';
import { Sheet, SheetHeader } from '../components/ui/Sheet';
import { Tabs } from '../components/ui/Tabs';
import { useColors } from '../theme';

type UseView = 'days' | 'months';

const AI_STUDIO = 'https://aistudio.google.com/usage';

/** "1 failed", in red beside a row that had failed requests. */
function Failed({ counts }: { counts: UsageCounts }) {
  const c = useColors();
  if (!counts.failed) return null;
  return <Text style={{ fontSize: 12, fontVariant: ['tabular-nums'], color: c.red600 }}>{counts.failed} failed</Text>;
}

/**
 * Settings → Gemini use: the requests this phone sent to Gemini and their tokens, per IST day (60 days) or per
 * month (13 months, each opening per model). Counted on the phone only (`geminiUsage` in core).
 */
export function GeminiUseSheet({ onClose }: { onClose(): void }) {
  const c = useColors();
  const dialogs = useDialogs();
  const [view, setView] = useState<UseView>('days');
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  // A reading finishing while this is open shows at once.
  const [, refresh] = useState(0);
  useEffect(() => onGeminiUsage(() => refresh((n) => n + 1)), []);
  const now = new Date();
  const days = geminiUsageDays(now);
  const months = geminiUsageMonths(now);

  const openStudio = () => void Linking.openURL(AI_STUDIO).catch((err: Error) => dialogs.alert('Could not open the browser', err.message));

  return (
    <Sheet kind="screen" label="Gemini use" onClose={onClose} gap={16}>
      <SheetHeader icon="data-usage" title="Gemini use" onClose={onClose} />
      {months.length === 0 ? (
        <EmptyState title="No Gemini requests yet.">Bills read on the phone don't use Gemini.</EmptyState>
      ) : (
        <>
          <Tabs<UseView>
            label="Show Gemini use by"
            value={view}
            onChange={setView}
            options={[
              { id: 'days', label: 'Days' },
              { id: 'months', label: 'Months' },
            ]}
          />
          {view === 'days' ? (
            <View style={{ gap: 6 }}>
              {days.length === 0 && <EmptyState title="No Gemini requests in the last 60 days." />}
              {days.map((d) => (
                <View key={d.day} accessible style={[styles.row, { backgroundColor: c.gray50 }]}>
                  <Text style={[styles.text, { color: c.gray800 }]}>{usageDayText(d, now)}</Text>
                  <Failed counts={d} />
                </View>
              ))}
            </View>
          ) : (
            <View style={{ gap: 6 }}>
              {months.map((m) => {
                const open = openMonth === m.month;
                return (
                  <View key={m.month} style={[styles.month, { backgroundColor: c.gray50 }]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded: open }}
                      accessibilityHint={open ? 'Hides the models' : 'Shows each model'}
                      onPress={() => setOpenMonth(open ? null : m.month)}
                      style={styles.monthHead}
                    >
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[styles.text, { fontWeight: '700', color: c.gray800 }]}>{usageMonthText(m)}</Text>
                        <Failed counts={m} />
                      </View>
                      <Icon name={open ? 'expand-less' : 'expand-more'} size={22} color={c.gray500} />
                    </Pressable>
                    {open &&
                      m.models.map((model) => (
                        <View key={model.model} accessible style={styles.model}>
                          <Text style={[styles.text, { color: c.gray700 }]}>
                            {model.model} · {usageSummary(model)}
                          </Text>
                          <Failed counts={model} />
                        </View>
                      ))}
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}
      <Text style={{ fontSize: 12, lineHeight: 17, color: c.gray500 }}>
        A request is one bill, quote or Test key sent to Gemini. Tokens are how Google measures what is sent and answered; a photo uses more than text. Counted on this phone, by
        IST day. Use of the same key elsewhere isn't included, and Google's own figures may differ.
      </Text>
      <Button variant="secondary" icon="open-in-new" block onPress={openStudio}>
        Open Google AI Studio
      </Button>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 14, lineHeight: 20, fontVariant: ['tabular-nums'] },
  row: { gap: 2, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  month: { borderRadius: 12, overflow: 'hidden' },
  monthHead: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  model: { gap: 2, paddingLeft: 24, paddingRight: 12, paddingBottom: 10 },
});
