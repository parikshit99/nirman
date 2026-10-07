import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Text, View, useWindowDimensions } from 'react-native';
import type { jsPDF } from 'jspdf';
import { pdfToJpegs } from '../lib/exportFiles';
import { useColors } from '../theme';
import { Button } from './ui/Button';
import { Sheet, SheetHeader } from './ui/Sheet';

/** The PDF exactly as it will be shared, page by page (Android's own PDF renderer), before sharing it. */
export function DocumentPreview({ title, build, onShare, shareLabel = 'Share PDF', onClose }: { title: string; build(): jsPDF; onShare(): void; shareLabel?: string; onClose(): void }) {
  const c = useColors();
  const { width } = useWindowDimensions();
  const [pages, setPages] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const files = await pdfToJpegs(build(), 'preview');
        if (live) setPages(files.map((f) => f.base64));
      } catch (err) {
        if (live) setError((err as Error).message);
      }
    })();
    return () => {
      live = false;
    };
    // Built once when opened: the preview shows what was on screen then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pageWidth = width - 32 - 16;
  return (
    <Sheet kind="screen" label="Preview" onClose={onClose}>
      <SheetHeader icon="visibility" title="Preview" subtitle={title} onClose={onClose} />
      <View style={{ minHeight: 200, padding: 8, gap: 8, borderRadius: 12, backgroundColor: c.gray100 }}>
        {error ? (
          <Text style={{ fontSize: 14, color: c.red600, padding: 16 }}>Could not show the preview: {error}</Text>
        ) : pages === null ? (
          <View style={{ paddingVertical: 64, alignItems: 'center' }}>
            <ActivityIndicator color={c.orange500} />
          </View>
        ) : (
          // The page is paper: it stays white in dark mode, like the file.
          pages.map((data, i) => <Image key={i} accessibilityLabel={`Page ${i + 1} of ${pages.length}`} source={{ uri: `data:image/jpeg;base64,${data}` }} style={{ width: pageWidth, aspectRatio: 0.707, height: undefined, backgroundColor: '#fff' }} resizeMode="contain" />)
        )}
      </View>
      <Button variant="primary" block icon="share" onPress={onShare}>
        {shareLabel}
      </Button>
    </Sheet>
  );
}
