import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Animated, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptic } from '../../lib/haptics';
import { useColors } from '../../theme';
import { Button } from './Button';
import { Sheet } from './Sheet';

export interface Dialogs {
  alert(title: string, message?: string): Promise<void>;
  confirm(title: string, opts?: { message?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }): Promise<boolean>;
  prompt(title: string, defaultValue?: string): Promise<string | null>;
  /** A short note that something worked: a Snackbar that goes by itself (nothing to choose). */
  toast(message: string): void;
}

const DialogContext = createContext<Dialogs | null>(null);

export function useDialogs(): Dialogs {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialogs outside DialogProvider');
  return ctx;
}

const TOAST_MS = 2500;

/** `confirm` and `alert` are Android's own dialog; `prompt` is a small sheet; `toast` is a Snackbar above the tab bar. */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [prompting, setPrompting] = useState<{ title: string; value: string; resolve(v: string | null): void } | null>(null);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);

  const api = useMemo<Dialogs>(
    () => ({
      alert: (title, message) =>
        new Promise<void>((resolve) => {
          Alert.alert(title, message, [{ text: 'OK', onPress: () => resolve() }], { cancelable: true, onDismiss: () => resolve() });
        }),
      confirm: (title, opts = {}) =>
        new Promise<boolean>((resolve) => {
          Alert.alert(
            title,
            opts.message,
            [
              { text: opts.cancelLabel ?? 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: opts.confirmLabel ?? 'OK', style: opts.danger ? 'destructive' : 'default', onPress: () => resolve(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) },
          );
        }),
      prompt: (title, defaultValue = '') => new Promise<string | null>((resolve) => setPrompting({ title, value: defaultValue, resolve })),
      toast: (message) => {
        haptic('confirm');
        setToast({ id: Date.now(), message });
      },
    }),
    [],
  );

  const closePrompt = (value: string | null) => {
    prompting?.resolve(value);
    setPrompting(null);
  };

  return (
    <DialogContext.Provider value={api}>
      {children}
      {prompting && (
        <Sheet kind="dialog" closeOnBackdrop onClose={() => closePrompt(null)} label={prompting.title}>
          <PromptBody title={prompting.title} initial={prompting.value} onDone={closePrompt} />
        </Sheet>
      )}
      <Snackbar toast={toast} onDone={() => setToast(null)} />
    </DialogContext.Provider>
  );
}

function PromptBody({ title, initial, onDone }: { title: string; initial: string; onDone(v: string | null): void }) {
  const c = useColors();
  const [value, setValue] = useState(initial);
  return (
    <>
      <Text style={{ fontSize: 14, fontWeight: '700', color: c.gray900 }}>{title}</Text>
      <TextInput
        autoFocus
        value={value}
        onChangeText={setValue}
        onSubmitEditing={() => onDone(value)}
        style={{ minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderRadius: 10, borderColor: c.gray200, backgroundColor: c.gray50, color: c.brandDark, fontSize: 14 }}
      />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Button style={{ flex: 1 }} onPress={() => onDone(null)}>
          Cancel
        </Button>
        <Button variant="primary" style={{ flex: 1 }} onPress={() => onDone(value)}>
          OK
        </Button>
      </View>
    </>
  );
}

/** Slides up from above the tab bar and fades by itself. */
function Snackbar({ toast, onDone }: { toast: { id: number; message: string } | null; onDone(): void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const done = useCallback(onDone, [onDone]);
  useEffect(() => {
    if (!toast) return;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    const timer = setTimeout(() => Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(done), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast, opacity, done]);
  if (!toast) return null;
  return (
    <Animated.View pointerEvents="none" accessibilityLiveRegion="polite" style={[styles.snackWrap, { bottom: 88 + insets.bottom, opacity }]}>
      <View style={[styles.snack, { backgroundColor: c.gray900 }]}>
        <Text style={{ color: c.white, fontSize: 14, fontWeight: '600' }}>{toast.message}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  snackWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 16 },
  snack: { maxWidth: 420, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
});
