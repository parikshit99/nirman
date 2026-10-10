import { Pressable } from './ui/Pressable';
import { useColors } from '../theme';
import { Icon } from './ui/Icon';

/** The bin on a row: deletes it at once, and the caller shows Undo (`dialogs.undoable`). */
export function TrashButton({ name, onPress }: { name: string; onPress(): void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Delete ${name}`}
      onPress={onPress}
      hitSlop={4}
      android_ripple={{ color: c.ripple, borderless: true, radius: 22 }}
      style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
    >
      <Icon name="delete-outline" size={20} color={c.gray500} />
    </Pressable>
  );
}
