import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Pressable } from './ui/Pressable';
import { useAppState } from '../state/AppState';
import { useColors } from '../theme';
import { Sheet, SheetHeader } from './ui/Sheet';

/** The bill photos lines were read from, to check the lines against the bill. */
export function BillPhotosSheet({ photoIds, title, onClose }: { photoIds: string[]; title: string; onClose(): void }) {
  const c = useColors();
  const { width } = useWindowDimensions();
  const { actions } = useAppState();
  const [photos, setPhotos] = useState<string[] | null>(null);
  const [zoomed, setZoomed] = useState<number | null>(null);
  const key = photoIds.join(',');
  useEffect(() => {
    let live = true;
    void Promise.all(key.split(',').filter(Boolean).map((id) => actions.getBillPhotos(id))).then((all) => live && setPhotos(all.flat()));
    return () => {
      live = false;
    };
  }, [key, actions]);

  return (
    <Sheet kind="screen" onClose={onClose} label="Bill photos">
      <SheetHeader icon="photo-camera" title="Bill photos" subtitle={title} onClose={onClose} />
      {photos === null ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={c.orange500} />
        </View>
      ) : photos.length === 0 ? (
        <Text style={{ fontSize: 14, color: c.gray500, paddingVertical: 24, textAlign: 'center' }}>The photos of this bill are no longer on this phone.</Text>
      ) : (
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 12, color: c.gray500 }}>Tap a photo to zoom in; it scrolls inside its box.</Text>
          {photos.map((data, i) => (
            <Pressable key={i} accessibilityRole="button" accessibilityLabel={`Bill photo ${i + 1} of ${photos.length}`} accessibilityState={{ selected: zoomed === i }} onPress={() => setZoomed(zoomed === i ? null : i)} style={{ borderWidth: 1, borderColor: c.gray200, borderRadius: 12, backgroundColor: c.gray50, overflow: 'hidden' }}>
              {zoomed === i ? (
                <ScrollView horizontal nestedScrollEnabled style={{ maxHeight: 520 }}>
                  <ScrollView nestedScrollEnabled>
                    <Image source={{ uri: `data:image/jpeg;base64,${data}` }} style={{ width: (width - 34) * 2.5, height: (width - 34) * 3.5 }} resizeMode="contain" />
                  </ScrollView>
                </ScrollView>
              ) : (
                <Image source={{ uri: `data:image/jpeg;base64,${data}` }} style={{ width: '100%', height: 300 }} resizeMode="contain" />
              )}
            </Pressable>
          ))}
        </View>
      )}
    </Sheet>
  );
}

// Covers already read, so scrolling the list back doesn't read them again.
const covers = new Map<string, { cover: string; pages: number }>();

/**
 * Small pictures of the bills behind a list (the first page of each), to tap and see the bills in full. Shows up to
 * `max`; the last one counts the pages not shown ("+3").
 */
export function BillThumbs({ photoIds, max, title, onPress }: { photoIds: string[]; max: number; title: string; onPress(): void }) {
  const c = useColors();
  const { actions } = useAppState();
  const key = photoIds.join(',');
  const known = () => photoIds.flatMap((id) => (covers.has(id) ? [{ id, ...covers.get(id)! }] : []));
  const [shown, setShown] = useState(known);
  useEffect(() => {
    const ids = key.split(',').filter(Boolean);
    const missing = ids.filter((id) => !covers.has(id));
    if (!missing.length) return setShown(known());
    let live = true;
    void actions.getBillPhotoCovers(missing).then((rows) => {
      for (const r of rows) covers.set(r.id, { cover: r.cover, pages: r.pages });
      if (live) setShown(known());
    });
    return () => {
      live = false;
    };
    // `known` reads the same ids as `key`.
  }, [key, actions]);
  if (!shown.length) return null;
  const pages = shown.reduce((n, p) => n + p.pages, 0);
  const thumbs = shown.slice(0, max);
  const hidden = pages - thumbs.length;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Bill photos of ${title}: ${pages} ${pages === 1 ? 'page' : 'pages'}`} onPress={onPress} style={{ flexDirection: 'row', gap: 6, borderRadius: 8, overflow: 'hidden' }}>
      {thumbs.map((p, i) => (
        <View key={p.id} style={{ width: 52, height: 52, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: c.gray200, backgroundColor: c.gray50 }}>
          <Image source={{ uri: `data:image/jpeg;base64,${p.cover}` }} resizeMethod="resize" style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          {i === thumbs.length - 1 && hidden > 0 && (
            <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: c.scrim + '80' }}>
              <Text style={{ fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'], color: '#fff' }}>{`+${hidden}`}</Text>
            </View>
          )}
        </View>
      ))}
    </Pressable>
  );
}

/** Distinct bill photos behind some lines, in order. */
export const photoIdsOf = (items: { photo_id: string }[]) => [...new Set(items.map((i) => i.photo_id).filter(Boolean))];
