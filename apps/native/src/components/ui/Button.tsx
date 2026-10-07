import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { haptic } from '../../lib/haptics';
import { useColors } from '../../theme';
import { Icon, type IconName } from './Icon';

/**
 * - `primary` (orange): the one main action on a screen or sheet.
 * - `secondary` (white, grey outline): other actions.
 * - `danger` (red): confirming a delete or clear.
 * - `dangerOutline` (red outline): a Delete button beside other actions.
 * - `ghost` (no background): Cancel and other quiet actions.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'dangerOutline' | 'ghost';

const HEIGHT = { sm: 36, md: 44 };

export function Button({
  variant = 'secondary',
  size = 'md',
  block,
  icon,
  children,
  onPress,
  disabled,
  label,
  style,
}: {
  variant?: ButtonVariant;
  size?: keyof typeof HEIGHT;
  /** Full width. */
  block?: boolean;
  icon?: IconName;
  children?: string;
  onPress?(): void;
  disabled?: boolean;
  /** For a screen reader, when the button shows only an icon. */
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const look = {
    primary: { bg: c.brandPrimary, border: 'transparent', fg: c.white },
    secondary: { bg: c.white, border: c.gray200, fg: c.gray800 },
    danger: { bg: c.red600, border: 'transparent', fg: '#fff' },
    dangerOutline: { bg: c.white, border: c.red200, fg: c.red600 },
    ghost: { bg: 'transparent', border: 'transparent', fg: c.gray500 },
  }[variant];
  const pressed = { primary: c.orange600, secondary: c.gray100, danger: c.red700, dangerOutline: c.red50, ghost: c.gray100 }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? children}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        // A buzz for the main action and for confirming a delete, like the old app.
        if (variant === 'primary') haptic('tap');
        else if (variant === 'danger') haptic('reject');
        onPress?.();
      }}
      style={({ pressed: down }) => [
        styles.base,
        { height: HEIGHT[size], paddingHorizontal: children ? 16 : 10, minWidth: children ? undefined : HEIGHT[size], backgroundColor: down ? pressed : look.bg, borderColor: look.border, opacity: disabled ? 0.5 : 1 },
        block && styles.block,
        style,
      ]}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} color={look.fg} />}
      {children ? (
        <View style={{ flexShrink: 1 }}>
          <Text numberOfLines={1} style={[styles.text, { color: look.fg }]}>
            {children}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, borderWidth: 1 },
  block: { alignSelf: 'stretch' },
  text: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
});
