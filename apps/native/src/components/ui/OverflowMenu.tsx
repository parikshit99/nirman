import { useState } from 'react';
import { Pressable } from 'react-native';
import { useColors } from '../../theme';
import { Icon, type IconName } from './Icon';
import { Sheet, SheetOption } from './Sheet';

export interface MenuItem {
  icon: IconName;
  label: string;
  about?: string;
  onPress(): void;
}

/** The ⋮ button of a header, so everything fits at 320 dp: opens the actions as a list. */
export function OverflowMenu({ items }: { items: MenuItem[] }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel="More actions" onPress={() => setOpen(true)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="more-vert" size={22} color={c.gray600} />
      </Pressable>
      {open && (
        <Sheet closeOnBackdrop onClose={() => setOpen(false)} label="More actions" gap={8}>
          {items.map((item) => (
            <SheetOption
              key={item.label}
              icon={item.icon}
              label={item.label}
              about={item.about}
              onPress={() => {
                setOpen(false);
                // Let this sheet go before the next thing opens.
                setTimeout(item.onPress, 250);
              }}
            />
          ))}
        </Sheet>
      )}
    </>
  );
}
