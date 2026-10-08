import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
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

/** Distinct bill photos behind some lines, in order. */
export const photoIdsOf = (items: { photo_id: string }[]) => [...new Set(items.map((i) => i.photo_id).filter(Boolean))];
