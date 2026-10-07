import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { MAX_IMAGES, compareQuotes, parseAmount, todayISO, variantLabel, type QuoteRow } from '@nirman/shared';
import { PhotoSourceSheet } from '../components/PhotoSourceSheet';
import { Button } from '../components/ui/Button';
import { useDialogs } from '../components/ui/Dialogs';
import { Icon } from '../components/ui/Icon';
import { Label, SuggestInput } from '../components/ui/fields';
import { DateField } from '../components/ui/Select';
import { Sheet } from '../components/ui/Sheet';
import { Tabs } from '../components/ui/Tabs';
import { chooseFromGallery, takePhoto } from '../lib/camera';
import { plural } from '../lib/format';
import { dataUrlToBase64 } from '../lib/images';
import { useAppState, type HistoryRecord } from '../state/AppState';
import { useColors } from '../theme';
import type { IncomingShare } from './CapturePanel';
import { QuoteCompare } from './QuoteCompare';
import { QuoteReview } from './QuoteReview';

type Screen = { name: 'list' | 'add' | 'compare' } | { name: 'review'; quoteId: string };

/** Vendor quotes for one saved BOQ: add, review the matching, compare vendors and past prices. */
export function QuotesView({ boqId, initial, onClose }: { boqId: string; initial?: IncomingShare; onClose(): void }) {
  const c = useColors();
  const { history, quotesFor } = useAppState();
  const boq = history.find((h) => h.id === boqId);
  const quotes = quotesFor(boqId);
  const confirmed = quotes.filter((q) => q.status === 'confirmed');
  const [screen, setScreen] = useState<Screen>(() => (quotes.length === 0 || initial ? { name: 'add' } : confirmed.length > 0 ? { name: 'compare' } : { name: 'list' }));
  // Shared photos fill in the first quote only.
  const [shared, setShared] = useState(initial);
  // Back steps out of a quote or the add form first, then closes.
  const stepBack = () => (screen.name === 'review' || screen.name === 'add' ? setScreen({ name: 'list' }) : onClose());
  if (!boq) return null;

  const reviewing = screen.name === 'review' ? quotes.find((q) => q.id === screen.quoteId) : undefined;
  const back = () => setScreen({ name: 'list' });
  const stepped = screen.name === 'review' || screen.name === 'add';

  return (
    <Sheet kind="screen" scroll={false} label="Vendor quotes" onClose={onClose} onBack={stepBack} padding={0} gap={0}>
      <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: c.gray200, backgroundColor: c.gray50 }}>
        {stepped ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back to quotes" onPress={back} style={{ minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -8 }}>
            <Icon name="arrow-back" size={22} color={c.gray600} />
          </Pressable>
        ) : (
          <View style={{ padding: 8, borderRadius: 8, backgroundColor: c.brandPrimary }}>
            <Icon name="local-shipping" size={18} color={c.white} />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '700', color: c.brandDark }}>
            Vendor quotes · {boq.title || 'Untitled BOQ'}
          </Text>
          <Text numberOfLines={1} style={{ fontSize: 12, fontFamily: 'monospace', color: c.gray500 }}>
            {plural(boq.items.length, 'BOQ item')}
            {boq.address ? ` · ${boq.address}` : ''}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center', marginRight: -8 }}>
          <Icon name="close" size={22} color={c.gray500} />
        </Pressable>
      </View>

      {(screen.name === 'list' || screen.name === 'compare') && (
        <View style={{ margin: 8 }}>
          <Tabs
            label="Quote views"
            value={screen.name}
            onChange={(name) => setScreen({ name })}
            options={[
              { id: 'compare', label: `Compare (${confirmed.length})` },
              { id: 'list', label: `Quotes (${quotes.length})` },
            ]}
          />
        </View>
      )}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
        {screen.name === 'add' && (
          <AddQuote
            boqId={boqId}
            initial={shared}
            onDone={(reviewQuoteId) => {
              setShared(undefined);
              // A typed quote opens straight in review, to check and confirm.
              if (reviewQuoteId) setScreen({ name: 'review', quoteId: reviewQuoteId });
              else back();
            }}
          />
        )}
        {screen.name === 'list' && <QuoteList boq={boq} quotes={quotes} onAdd={() => setScreen({ name: 'add' })} onOpen={(q) => setScreen({ name: 'review', quoteId: q.id })} />}
        {screen.name === 'review' && (reviewing ? <QuoteReview boq={boq} quote={reviewing} onDone={() => setScreen({ name: 'compare' })} /> : <Text style={{ fontSize: 12, color: c.gray500 }}>This quote was deleted.</Text>)}
        {screen.name === 'compare' && <QuoteCompare boq={boq} quotes={confirmed} onAdd={() => setScreen({ name: 'add' })} />}
      </ScrollView>
    </Sheet>
  );
}

function QuoteList({ boq, quotes, onAdd, onOpen }: { boq: HistoryRecord; quotes: QuoteRow[]; onAdd(): void; onOpen(q: QuoteRow): void }) {
  const c = useColors();
  const { linesFor, jobForQuote, itemDatabase, learning, status, settings, actions } = useAppState();
  const dialogs = useDialogs();

  const remove = async (q: QuoteRow) => {
    const ok = await dialogs.confirm(`Delete ${q.vendor}'s quote?`, {
      message: q.status === 'confirmed' ? 'Prices already added to Rates stay there; remove them from the Rates tab if needed.' : undefined,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) await actions.deleteQuote(q.id);
  };

  return (
    <View style={{ gap: 12 }}>
      <Button variant="primary" block icon="add" onPress={onAdd}>
        Add vendor quote
      </Button>
      {quotes.length === 0 && <Text style={{ fontSize: 12, color: c.gray500, textAlign: 'center', padding: 24 }}>No quotes yet for this BOQ.</Text>}
      {quotes.map((q) => {
        const job = jobForQuote(q.id);
        const lines = linesFor(q.id);
        const summary = compareQuotes(boq.items, [q], lines, itemDatabase, learning, boq.project_id).vendors[0];
        let state: ReactNode;
        if (job?.status === 'failed') {
          state = <Text style={{ fontSize: 12, color: c.red600 }}>{job.error}</Text>;
        } else if (job) {
          const waiting = !status.online ? 'Waiting for internet' : !settings.geminiApiKey ? 'Add your Gemini key in Settings' : 'Reading…';
          state = (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {waiting === 'Reading…' && <ActivityIndicator size={12} color={c.orange600} />}
              <Text style={{ fontSize: 12, color: c.orange600 }}>{waiting}</Text>
            </View>
          );
        } else if (lines.length === 0) {
          state = <Text style={{ fontSize: 12, color: c.gray500 }}>Nothing was read. Delete it and add the quote again.</Text>;
        } else {
          state = (
            <Text style={{ fontSize: 12, color: q.status === 'confirmed' ? c.green700 : c.blue700 }}>
              {q.status === 'confirmed' ? 'Confirmed' : 'Needs review'} · {summary.quoted} of {boq.items.length} quoted
              {summary.missing.length > 0 && <Text style={{ fontWeight: '700', color: c.red600 }}>{` · ${summary.missing.length} missing`}</Text>}
              {summary.extras.length > 0 && ` · ${summary.extras.length} extra`}
            </Text>
          );
        }
        return (
          <View key={q.id} style={{ padding: 16, gap: 8, borderWidth: 1, borderColor: c.gray200, borderRadius: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '700', color: c.gray900 }}>
                  {q.vendor || 'Unnamed vendor'}
                </Text>
                <Text style={{ fontSize: 12, fontFamily: 'monospace', color: c.gray500 }}>{new Date(q.quote_date).toLocaleDateString('en-IN')}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${q.vendor}'s quote`} onPress={() => remove(q)} style={{ minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center', margin: -8 }}>
                <Icon name="delete-outline" size={18} color={c.gray500} />
              </Pressable>
            </View>
            {state}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {job?.status === 'failed' && (
                <Button size="sm" icon="replay" style={{ flex: 1 }} onPress={() => actions.retryJob(job)}>
                  Retry
                </Button>
              )}
              {!job && lines.length > 0 && (
                <Button variant="primary" size="sm" style={{ flex: 1 }} onPress={() => onOpen(q)}>
                  {q.status === 'confirmed' ? 'View lines' : 'Review & confirm'}
                </Button>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function AddQuote({ boqId, initial, onDone }: { boqId: string; initial?: IncomingShare; onDone(reviewQuoteId?: string): void }) {
  const c = useColors();
  const { actions, knownVendors, history } = useAppState();
  const dialogs = useDialogs();
  const [vendor, setVendor] = useState('');
  const [date, setDate] = useState(todayISO());
  const [text, setText] = useState(initial?.text ?? '');
  const [images, setImages] = useState<string[]>(initial?.images.slice(0, MAX_IMAGES) ?? []);
  const [sourceMenu, setSourceMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  // Typing the vendor's rates against each BOQ line needs no AI or internet.
  const [mode, setMode] = useState<'read' | 'type'>('read');
  const boqItems = history.find((h) => h.id === boqId)?.items ?? [];
  const [rates, setRates] = useState<Record<string, string>>({});
  const typed = boqItems.map((i) => ({ boqItemId: i.id, unitPrice: parseAmount(rates[i.id] ?? '') ?? NaN })).filter((r) => r.unitPrice > 0);
  const badRate = boqItems.some((i) => (rates[i.id] ?? '').trim() && !(Number(parseAmount(rates[i.id])) >= 0));
  const submitTyped = async () => {
    setBusy(true);
    try {
      const id = await actions.createManualQuote({ boqId, vendor, quoteDate: date || todayISO(), rates: typed });
      onDone(id);
    } finally {
      setBusy(false);
    }
  };

  const pickFrom = async (source: 'camera' | 'gallery') => {
    setSourceMenu(false);
    try {
      const results = source === 'camera' ? [await takePhoto()] : await chooseFromGallery(MAX_IMAGES - images.length);
      setImages((prev) => [...prev, ...results.filter((x): x is string => !!x)].slice(0, MAX_IMAGES));
    } catch (err) {
      await dialogs.alert(source === 'camera' ? 'Could not open the camera' : 'Could not open the gallery', (err as Error).message);
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      await actions.enqueueQuote({ boqId, vendor, quoteDate: date || todayISO(), text: text.trim(), images: images.map(dataUrlToBase64) });
      onDone();
    } finally {
      setBusy(false);
    }
  };
  const ready = vendor.trim() && (images.length > 0 || text.trim());

  return (
    <View style={{ gap: 16 }}>
      <Tabs<'read' | 'type'>
        label="How to add the quote"
        value={mode}
        onChange={setMode}
        options={[
          { id: 'read', label: 'Photo / text (AI)' },
          { id: 'type', label: 'Type rates' },
        ]}
      />
      <Text style={{ fontSize: 12, lineHeight: 18, color: c.gray500 }}>
        {mode === 'read'
          ? "Photograph the vendor's reply as it is, even if they wrote their own list. The phone reads it and matches each line to this BOQ (Gemini helps when it is unsure and you are online), and you check the matches before anything is saved."
          : "Enter the vendor's rate against each BOQ line; leave blank what they didn't quote. Works without internet or an API key."}
      </Text>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <SuggestInput label="Vendor" value={vendor} onChange={setVendor} suggestions={knownVendors} placeholder="e.g. Sharma Traders" />
        </View>
        <View style={{ width: 150 }}>
          <DateField label="Quote date" value={date} onChange={setDate} />
        </View>
      </View>

      {mode === 'type' ? (
        <>
          <View style={{ borderWidth: 1, borderColor: c.gray200, borderRadius: 12 }}>
            {boqItems.map((item, i) => (
              <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: c.gray100 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '700', color: c.brandDark }}>
                    {i + 1}. {item.item_name}
                  </Text>
                  <Text numberOfLines={1} style={{ fontSize: 12, color: c.gray500 }}>
                    {[variantLabel(item), `${item.quantity} ${item.unit}`].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 12, color: c.gray500 }}>₹</Text>
                  <TextInput
                    keyboardType="decimal-pad"
                    accessibilityLabel={`Rate for ${item.item_name}`}
                    value={rates[item.id] ?? ''}
                    onChangeText={(t) => setRates((r) => ({ ...r, [item.id]: t }))}
                    placeholder={`per ${item.unit}`}
                    placeholderTextColor={c.gray500}
                    style={{ width: 96, minHeight: 44, paddingHorizontal: 8, borderWidth: 1, borderColor: c.gray200, borderRadius: 8, backgroundColor: c.gray50, color: c.brandDark, fontSize: 14, fontFamily: 'monospace' }}
                  />
                </View>
              </View>
            ))}
          </View>
          <Button variant="primary" block icon="check-circle" disabled={!vendor.trim() || typed.length === 0 || badRate || busy} onPress={submitTyped}>
            {`Review ${plural(typed.length, 'rate')}`}
          </Button>
          {badRate && <Text style={{ fontSize: 12, color: c.red600, textAlign: 'center' }}>Use digits for rates, e.g. 380 or 1,500.</Text>}
        </>
      ) : (
        <>
          <View>
            <Label>Photos of the quote</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {images.map((src, idx) => (
                <View key={idx} style={{ width: '31%', aspectRatio: 1, borderRadius: 8, borderWidth: 1, borderColor: c.gray200, overflow: 'hidden' }}>
                  <Image source={{ uri: src }} accessibilityLabel={`Page ${idx + 1}`} style={{ width: '100%', height: '100%' }} />
                  <Pressable accessibilityRole="button" accessibilityLabel={`Remove page ${idx + 1}`} onPress={() => setImages((prev) => prev.filter((_, i) => i !== idx))} style={{ position: 'absolute', top: 2, right: 2, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.red500, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="delete" size={14} color="#fff" />
                    </View>
                  </Pressable>
                </View>
              ))}
              {images.length < MAX_IMAGES && (
                <Pressable accessibilityRole="button" onPress={() => setSourceMenu(true)} style={{ width: '31%', aspectRatio: 1, borderRadius: 8, borderWidth: 2, borderStyle: 'dashed', borderColor: c.gray300, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                  <Icon name="photo-camera" size={20} color={c.gray500} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray500 }}>Add page</Text>
                </Pressable>
              )}
            </View>
          </View>

          <View>
            <Label>Or type / paste the quote (optional)</Label>
            <TextInput
              multiline
              value={text}
              onChangeText={setText}
              placeholder="e.g. cement ACC 380 per bag, reti 1400 per ton…"
              placeholderTextColor={c.gray500}
              textAlignVertical="top"
              style={{ minHeight: 80, padding: 12, borderWidth: 1, borderColor: c.gray200, borderRadius: 12, backgroundColor: c.gray50, color: c.brandDark, fontSize: 14 }}
            />
          </View>

          <Button variant="primary" block icon="check-circle" disabled={!ready || busy} onPress={submit}>
            Read quote
          </Button>
        </>
      )}
      {!vendor.trim() && <Text style={{ fontSize: 12, color: c.gray500, textAlign: 'center' }}>Enter the vendor's name to continue.</Text>}
      {sourceMenu && <PhotoSourceSheet remaining={MAX_IMAGES - images.length} onPick={pickFrom} onClose={() => setSourceMenu(false)} />}
    </View>
  );
}
