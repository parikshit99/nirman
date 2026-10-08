import { File } from 'expo-file-system';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Image, ScrollView, Text } from 'react-native';
import { logError, logStep, type ListKind } from '@nirman/core';
import { MAX_IMAGES } from '@nirman/shared';
import Nirman, { type SharedPayload } from '../../modules/nirman-native';
import { Button } from '../components/ui/Button';
import { Sheet, SheetLabel, SheetOption } from '../components/ui/Sheet';
import { compressImage } from '../lib/images';
import { goToTab } from '../navigation';
import { useAppState } from '../state/AppState';
import { useColors } from '../theme';
import type { IncomingShare } from './CapturePanel';
import { useQuotes } from './QuotesHost';

/** Photos (compressed, as data URLs) and text from the share; the copies in the cache folder are deleted. */
async function readShare({ files, text }: SharedPayload): Promise<IncomingShare> {
  const images: string[] = [];
  for (const f of files) {
    const uri = `file://${f.path}`;
    try {
      if (images.length < MAX_IMAGES) images.push(await compressImage(uri));
    } catch (err) {
      logError(err, 'read shared photo');
    }
    try {
      new File(uri).delete();
    } catch {
      // Left in the cache folder; Android clears it.
    }
  }
  return { images, text: (text ?? '').trim() };
}

const ShareContext = createContext<{ forList: { kind: ListKind; share: IncomingShare } | null; used(): void } | null>(null);

/**
 * Photos or text shared to Nirman from another app (e.g. a bill forwarded on WhatsApp): asks where they go, then
 * opens that tab's entry form with them (`useIncomingShare`), or the vendor quotes for a saved BOQ.
 */
export function ShareHost({ children }: { children: ReactNode }) {
  const { allHistory } = useAppState();
  const quotes = useQuotes();
  const [incoming, setIncoming] = useState<IncomingShare | null>(null);
  const [forList, setForList] = useState<{ kind: ListKind; share: IncomingShare } | null>(null);

  useEffect(() => {
    const take = () => {
      const payload = Nirman.takeShared();
      if (!payload) return;
      void readShare(payload).then((share) => {
        logStep('shared into the app', { photos: share.images.length, text: !!share.text });
        if (share.images.length || share.text) setIncoming(share);
      });
    };
    // The share that started the app, then any that arrive while it is open.
    take();
    const sub = Nirman.addListener('shared', take);
    return () => sub.remove();
  }, []);

  const pick = (target: ListKind | 'quote') => {
    if (!incoming) return;
    if (target === 'quote') quotes.pick(incoming);
    else {
      goToTab(target === 'audit' ? 'Purchases' : 'BOQ');
      setForList({ kind: target, share: incoming });
    }
    setIncoming(null);
  };
  const used = useCallback(() => setForList(null), []);

  return (
    <ShareContext.Provider value={{ forList, used }}>
      {children}
      {incoming && <ShareTargetSheet share={incoming} hasSavedBoqs={allHistory.some((h) => h.kind === 'boq')} onPick={pick} onClose={() => setIncoming(null)} />}
    </ShareContext.Provider>
  );
}

/** What was shared for this tab's list, if anything, and a call to say the entry form has it. */
export function useIncomingShare(kind: ListKind): { share: IncomingShare | null; used(): void } {
  const ctx = useContext(ShareContext);
  return { share: ctx?.forList?.kind === kind ? ctx.forList.share : null, used: ctx?.used ?? (() => {}) };
}

/** Where photos or text shared from another app should go. */
function ShareTargetSheet({ share, hasSavedBoqs, onPick, onClose }: { share: IncomingShare; hasSavedBoqs: boolean; onPick(target: ListKind | 'quote'): void; onClose(): void }) {
  const c = useColors();
  const what = share.images.length ? `${share.images.length} ${share.images.length === 1 ? 'photo' : 'photos'}` : 'Text';
  return (
    <Sheet closeOnBackdrop onClose={onClose} label="Add shared items" gap={8}>
      <SheetLabel>{what} received</SheetLabel>
      {share.images.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
          {share.images.map((src, i) => (
            <Image key={i} source={{ uri: src }} accessibilityLabel={`Shared photo ${i + 1}`} style={{ width: 64, height: 64, borderRadius: 8, borderWidth: 1, borderColor: c.gray200 }} />
          ))}
        </ScrollView>
      )}
      {share.text ? (
        <Text numberOfLines={3} style={{ fontSize: 12, color: c.gray600, backgroundColor: c.gray50, borderRadius: 8, padding: 8 }}>
          “{share.text}”
        </Text>
      ) : null}
      <Text style={{ fontSize: 12, color: c.gray500, paddingHorizontal: 4 }}>Add to:</Text>
      <SheetOption icon="shopping-cart" label="Purchases" about="A bill or note of what was bought" onPress={() => onPick('audit')} />
      <SheetOption icon="description" label="BOQ" about="A list of what you need, to send to vendors" onPress={() => onPick('boq')} />
      <SheetOption
        icon="local-shipping"
        label="Vendor quote"
        about={hasSavedBoqs ? "A vendor's prices for one of your saved BOQs" : 'Save a BOQ first to add quotes to it'}
        onPress={() => onPick('quote')}
        disabled={!hasSavedBoqs}
      />
      <Button variant="ghost" block onPress={onClose}>
        Cancel
      </Button>
    </Sheet>
  );
}
