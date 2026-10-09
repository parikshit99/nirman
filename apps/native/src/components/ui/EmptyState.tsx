import type React from 'react';
import { Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { useColors } from '../../theme';

/** What a list shows when it has nothing in it (or nothing matches the filters). Same props as the 6.x app's, with an image for the icon. */
export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ImageSourcePropType;
  title: string;
  /** One or two lines saying where things come from or what to do. */
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const c = useColors();
  return (
    <View style={styles.box}>
      {icon && <Image source={icon} style={[styles.icon, { tintColor: c.gray400 }]} />}
      <Text style={[styles.title, { color: c.gray600 }]}>{title}</Text>
      {children ? <Text style={[styles.hint, { color: c.gray500 }]}>{children}</Text> : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { paddingVertical: 48, paddingHorizontal: 16, alignItems: 'center' },
  icon: { width: 36, height: 36, marginBottom: 12 },
  title: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  hint: { fontSize: 12, lineHeight: 19, marginTop: 4, maxWidth: 320, textAlign: 'center' },
  action: { marginTop: 16 },
});
