import { Pressable, Text } from 'react-native';
import { useColors } from '../theme';
import { Icon } from './ui/Icon';

/** Takes the place of the delete button while a delete can still be undone. */
export function UndoButton({ onUndo, label }: { onUndo(): void; label: string }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Undo delete ${label}`} onPress={onUndo} style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, borderRadius: 12, backgroundColor: c.blue50 }}>
      <Icon name="undo" size={16} color={c.blue600} />
      <Text style={{ fontSize: 12, fontWeight: '700', color: c.blue600 }}>Undo</Text>
    </Pressable>
  );
}
