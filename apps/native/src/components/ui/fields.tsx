import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle } from 'react-native';
import { Pressable } from './Pressable';
import { matchSuggestions, type Suggestion } from './suggest';
import { useColors } from '../../theme';

/** A small label over a field (`text-xs font-bold`). */
export function Label({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text style={[styles.label, { color: c.gray600 }]}>{children}</Text>;
}

/** A text field with the label above it. `mono` for amounts, rates and quantities. */
export function Field({
  label,
  mono,
  bold,
  style,
  ...input
}: TextInputProps & {
  label?: string;
  mono?: boolean;
  bold?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const c = useColors();
  return (
    <View style={styles.field}>
      {label ? <Label>{label}</Label> : null}
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.gray500}
        {...input}
        style={[styles.input, { backgroundColor: c.white, borderColor: c.gray200, color: c.brandDark }, mono && styles.mono, bold && { fontWeight: '700' }, style]}
      />
    </View>
  );
}

/** A number field: Android's number keyboard. */
export function NumberField({ keyboardType = 'decimal-pad', ...props }: React.ComponentProps<typeof Field>) {
  return <Field mono keyboardType={keyboardType} {...props} />;
}

/**
 * A text field with suggestions listed under it, in the page rather than over it, so the field stays in view
 * while typing.
 */
export function SuggestInput({
  label,
  value,
  onChange,
  suggestions,
  ...input
}: Omit<TextInputProps, 'value' | 'onChangeText' | 'onChange'> & {
  label?: string;
  value: string;
  onChange(value: string): void;
  suggestions: readonly Suggestion[];
}) {
  const c = useColors();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(false); // after picking one, until the next key
  const shown = focused && !hidden ? matchSuggestions(suggestions, value) : [];
  return (
    <View style={styles.field}>
      {label ? <Label>{label}</Label> : null}
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.gray500}
        autoComplete="off"
        autoCorrect={false}
        {...input}
        value={value}
        onChangeText={(t) => {
          setHidden(false);
          onChange(t);
        }}
        onFocus={(e) => {
          setFocused(true);
          setHidden(false);
          input.onFocus?.(e);
        }}
        onBlur={(e) => {
          // Let a tap on a suggestion land before the list goes away.
          setTimeout(() => setFocused(false), 150);
          input.onBlur?.(e);
        }}
        style={[styles.input, { backgroundColor: c.white, borderColor: c.gray200, color: c.brandDark }, input.style]}
      />
      {shown.length > 0 && (
        <View accessibilityLabel="Suggestions" style={[styles.list, { backgroundColor: c.white, borderColor: c.gray200 }]}>
          {shown.map((s, i) => (
            <Pressable
              key={s.value}
              accessibilityRole="button"
              onPress={() => {
                onChange(s.value);
                setHidden(true);
              }}
              style={[styles.suggestion, i > 0 && { borderTopWidth: 1, borderTopColor: c.gray200 }]}
            >
              <Text style={{ flexShrink: 1, fontSize: 14, color: c.gray800 }}>{s.value}</Text>
              {s.hint ? <Text style={{ fontSize: 12, color: c.gray500 }}>{s.hint}</Text> : null}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  field: { flexShrink: 1, minWidth: 0 },
  input: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderRadius: 10, fontSize: 14 },
  mono: { fontVariant: ['tabular-nums'] },
  list: { marginTop: 4, borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  suggestion: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
});
