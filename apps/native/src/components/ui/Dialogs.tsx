import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { Pressable } from './Pressable';
import Animated, { Easing, runOnJS, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptic } from '../../lib/haptics';
import { DURATION, EASE_IN, EASE_OUT } from '../../lib/motion';
import { useColors } from '../../theme';
import { Button } from './Button';
import { Sheet } from './Sheet';

export interface Dialogs {
  alert(title: string, message?: string): Promise<void>;
  confirm(title: string, opts?: { message?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }): Promise<boolean>;
  prompt(title: string, defaultValue?: string): Promise<string | null>;
  /** A short note that something worked: a strip at the bottom that goes by itself (nothing to choose). */
  toast(message: string): void;
  /** The same strip with **Undo** and a countdown ring, as Telegram's: `undo` runs if tapped before `ms` is up. */
  undoable(message: string, undo: () => void, ms?: number): void;
}

const DialogContext = createContext<Dialogs | null>(null);

export function useDialogs(): Dialogs {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialogs outside DialogProvider');
  return ctx;
}

const TOAST_MS = 2500;

export interface Bulletin {
  id: number;
  message: string;
  undo?: () => void;
  ms: number;
}

/** `confirm` and `alert` are Android's own dialog; `prompt` is a small sheet; `toast` is a Snackbar above the tab bar. */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [prompting, setPrompting] = useState<{ title: string; value: string; resolve(v: string | null): void } | null>(null);
  const [toast, setToast] = useState<Bulletin | null>(null);

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
        setToast({ id: Date.now(), message, ms: TOAST_MS });
      },
      undoable: (message, undo, ms = 10_000) => {
        haptic('confirm');
        setToast({ id: Date.now(), message, undo, ms });
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

/**
 * Slides up above the tab bar, as Telegram's bulletins do, and slides away by itself. With `undo`, it has an Undo
 * button and a ring counting the seconds left; a new strip replaces the one showing.
 */
function Snackbar({ toast, onDone }: { toast: Bulletin | null; onDone(): void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const y = useSharedValue(1);
  const left = useSharedValue(1);
  const [seconds, setSeconds] = useState(0);
  const done = useCallback(onDone, [onDone]);
  useEffect(() => {
    if (!toast) return;
    y.value = 1;
    y.value = withTiming(0, { duration: DURATION.normal, easing: EASE_OUT });
    left.value = 1;
    left.value = withTiming(0, { duration: toast.ms, easing: Easing.linear });
    const end = Date.now() + toast.ms;
    setSeconds(Math.ceil(toast.ms / 1000));
    const tick = setInterval(() => setSeconds(Math.max(0, Math.ceil((end - Date.now()) / 1000))), 250);
    const timer = setTimeout(() => {
      y.value = withTiming(1, { duration: DURATION.quick, easing: EASE_IN }, (finished) => {
        if (finished) runOnJS(done)();
      });
    }, toast.ms);
    return () => {
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, [toast, y, left, done]);
  const slide = useAnimatedStyle(() => ({ opacity: 1 - y.value, transform: [{ translateY: 24 * y.value }] }));
  const ring = useAnimatedProps(() => ({ strokeDashoffset: RING * (1 - left.value) }));
  if (!toast) return null;
  const undo = toast.undo;
  return (
    <Animated.View pointerEvents="box-none" accessibilityLiveRegion="polite" style={[styles.snackWrap, { bottom: 88 + insets.bottom }, slide]}>
      <View style={[styles.snack, { backgroundColor: c.gray900 }]}>
        {undo && (
          <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={24} height={24} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
              <AnimatedCircle cx={12} cy={12} r={10} stroke={c.white} strokeWidth={2} fill="none" strokeDasharray={RING} animatedProps={ring} strokeLinecap="round" />
            </Svg>
            <Text style={{ color: c.white, fontSize: 11, fontWeight: '700' }}>{seconds}</Text>
          </View>
        )}
        <Text style={{ flexShrink: 1, color: c.white, fontSize: 14, fontWeight: '600' }}>{toast.message}</Text>
        {undo && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Undo: ${toast.message}`}
            onPress={() => {
              undo();
              done();
            }}
            style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 8, marginRight: -8 }}
          >
            <Text style={{ color: c.orange300, fontSize: 14, fontWeight: '700' }}>Undo</Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

const RING = 2 * Math.PI * 10;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const styles = StyleSheet.create({
  snackWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 16 },
  snack: { maxWidth: 420, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
});
