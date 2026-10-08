import { Fragment, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { ReleaseNotes } from '@nirman/core';
import { Button } from '../components/ui/Button';
import { Sheet, SheetHeader } from '../components/ui/Sheet';
import { useColors, type Colors } from '../theme';

/** **bold**, *italic* and `code` inside a line of the changelog. */
function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <Text key={i} style={{ fontWeight: '700' }}>{part.slice(2, -2)}</Text>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <Text key={i} style={{ fontStyle: 'italic' }}>{part.slice(1, -1)}</Text>;
    if (part.startsWith('`') && part.endsWith('`')) return <Text key={i} style={{ fontFamily: 'monospace' }}>{part.slice(1, -1)}</Text>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/** Paragraphs, "**Heading**" lines and "- " bullets. */
function render(lines: string[], c: Colors) {
  const out: ReactNode[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const heading = /^\*\*(.+)\*\*$/.exec(line);
    if (heading) {
      out.push(
        <Text key={out.length} accessibilityRole="header" style={{ fontSize: 12, fontWeight: '700', color: c.orange600, paddingTop: 8 }}>
          {heading[1]}
        </Text>,
      );
    } else if (line.startsWith('- ')) {
      out.push(
        <View key={out.length} style={{ flexDirection: 'row', gap: 8, paddingLeft: 4 }}>
          <Text style={{ fontSize: 14, lineHeight: 20, color: c.gray700 }}>•</Text>
          <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: c.gray700 }}>{inline(line.slice(2))}</Text>
        </View>,
      );
    } else {
      out.push(
        <Text key={out.length} style={{ fontSize: 14, lineHeight: 20, color: c.gray600 }}>
          {inline(line)}
        </Text>,
      );
    }
  }
  return out;
}

/** The newest section of the changelog, shown once after an update and from Settings. */
export function WhatsNewSheet({ notes, onClose }: { notes: ReleaseNotes; onClose(): void }) {
  const c = useColors();
  return (
    <Sheet kind="dialog" scroll={false} onClose={onClose} label="What's new" gap={8}>
      <SheetHeader icon="auto-awesome" title={notes.title || `Nirman ${notes.version}`} subtitle={`What's new · version ${notes.version}`} onClose={onClose} />
      {/* Only the notes scroll: Got it stays in view on small screens. */}
      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 8 }}>
        {render(notes.lines, c)}
      </ScrollView>
      <Button variant="primary" block style={{ marginTop: 8 }} onPress={onClose}>
        Got it
      </Button>
    </Sheet>
  );
}
