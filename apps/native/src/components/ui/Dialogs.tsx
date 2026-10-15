import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Pressable } from './Pressable';
import Animated, { Easing, runOnJS, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptic } from '../../lib/haptics';
import { DURATION, EASE_IN, EASE_OUT } from '../../lib/motion';
import { useColors } from '../../theme';
import { Button } from './Button';
import { Sheet, SheetOverlay } from './Sheet';

export interface Dialogs {
  alert(title: string, message?: string): Promise<void>;
  confirm(title: string, opts?: { message?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }): Promise<boolean>;
  /** `confirm` where both buttons do something: true for the confirm button, false for the other, null when dismissed (Back or outside). */
  choose(title: string, opts: { message?: string; confirmLabel: string; cancelLabel: string }): Promise<boolean | null>;
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
let nextId = 1;

export interface Bulletin {
  id: number;
  message: string;
  undo?: () => void;
  ms: number;
  /** When it goes (Date.now() time), so moving to another window keeps the time left. */
  until: number;
}

/**
 * Each open dialog or screen (its own window) registers a host for the Snackbar; it shows in the one opened last,
 * else in the app's own window above the tab bar.
 */
interface SnackbarHosts {
  toast: Bulletin | null;
  top?: number;
  done(): void;
  add(id: number): void;
  remove(id: number): void;
}

const HostsContext = createContext<SnackbarHosts | null>(null);
let nextHost = 1;

/** The Snackbar inside a dialog's or screen's window; Sheet draws it through `SheetOverlay`. */
function HostedSnackbar() {
  const hosts = useContext(HostsContext);
  // Taken while rendering, so a screen opened inside another (rendered after it) gets the higher number.
  const [id] = useState(() => nextHost++);
  const add = hosts?.add;
  const remove = hosts?.remove;
  useEffect(() => {
    add?.(id);
    return () => remove?.(id);
  }, [id, add, remove]);
  if (!hosts || hosts.top !== id) return null;
  return <Snackbar toast={hosts.toast} onDone={hosts.done} above={16} />;
}

interface Asking {
  id: number;
  title: string;
  message?: string;
  confirmLabel: string;
  /** No cancel button: an alert, with only OK. */
  cancelLabel?: string;
  danger?: boolean;
  /** null: dismissed with Back or a tap outside. */
  resolve(answer: boolean | null): void;
}

/** `confirm` and `alert` are the app's own Material 3 dialog; `prompt` is a small one with a field; `toast` is a Snackbar above the tab bar. */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [prompting, setPrompting] = useState<{ title: string; value: string; resolve(v: string | null): void } | null>(null);
  // Questions waiting their turn: one dialog shows at a time.
  const [asking, setAsking] = useState<Asking[]>([]);
  const [toast, setToast] = useState<Bulletin | null>(null);
  const [hostIds, setHostIds] = useState<number[]>([]);
  const done = useCallback(() => setToast(null), []);
  const add = useCallback((id: number) => setHostIds((h) => [...h, id]), []);
  const remove = useCallback((id: number) => setHostIds((h) => h.filter((x) => x !== id)), []);
  const top = hostIds.length ? Math.max(...hostIds) : undefined;
  const hosts = useMemo<SnackbarHosts>(() => ({ toast, top, done, add, remove }), [toast, top, done, add, remove]);

  const api = useMemo<Dialogs>(
    () => ({
      alert: (title, message) =>
        new Promise<void>((resolve) => {
          setAsking((q) => [...q, { id: nextId++, title, message, confirmLabel: 'OK', resolve: () => resolve() }]);
        }),
      confirm: (title, opts = {}) =>
        new Promise<boolean>((resolve) => {
          setAsking((q) => [...q, { id: nextId++, title, message: opts.message, confirmLabel: opts.confirmLabel ?? 'OK', cancelLabel: opts.cancelLabel ?? 'Cancel', danger: opts.danger, resolve: (a) => resolve(a === true) }]);
        }),
      choose: (title, opts) =>
        new Promise<boolean | null>((resolve) => {
          setAsking((q) => [...q, { id: nextId++, title, message: opts.message, confirmLabel: opts.confirmLabel, cancelLabel: opts.cancelLabel, resolve }]);
        }),
      prompt: (title, defaultValue = '') => new Promise<string | null>((resolve) => setPrompting({ title, value: defaultValue, resolve })),
      toast: (message) => {
        haptic('confirm');
        setToast({ id: Date.now(), message, ms: TOAST_MS, until: Date.now() + TOAST_MS });
      },
      undoable: (message, undo, ms = 10_000) => {
        haptic('confirm');
        setToast({ id: Date.now(), message, undo, ms, until: Date.now() + ms });
      },
    }),
    [],
  );

  const current = asking[0];
  const answer = (a: boolean | null) => {
    current?.resolve(a);
    setAsking((q) => q.slice(1));
  };

  const closePrompt = (value: string | null) => {
    prompting?.resolve(value);
    setPrompting(null);
  };

  return (
    <DialogContext.Provider value={api}>
      <HostsContext.Provider value={hosts}>
        <SheetOverlay.Provider value={HostedSnackbar}>
          {children}
          {current && (
            <Sheet key={current.id} kind="dialog" closeOnBackdrop onClose={() => answer(null)} label={current.title} padding={24} gap={16}>
              <AskBody asking={current} onAnswer={answer} />
            </Sheet>
          )}
          {prompting && (
            <Sheet kind="dialog" closeOnBackdrop onClose={() => closePrompt(null)} label={prompting.title}>
              <PromptBody title={prompting.title} initial={prompting.value} onDone={closePrompt} />
            </Sheet>
          )}
          {top === undefined && <Snackbar toast={toast} onDone={done} above={88} />}
        </SheetOverlay.Provider>
      </HostsContext.Provider>
    </DialogContext.Provider>
  );
}

/** Material 3's basic dialog: a headline, the supporting text, and the buttons at the end (Cancel as a text button). */
function AskBody({ asking, onAnswer }: { asking: Asking; onAnswer(ok: boolean): void }) {
  const c = useColors();
  return (
    <>
      <Text accessibilityRole="header" style={{ fontSize: 22, lineHeight: 28, fontWeight: '600', color: c.brandDark }}>
        {asking.title}
      </Text>
      {!!asking.message && <Text style={{ fontSize: 14, lineHeight: 20, color: c.gray600 }}>{asking.message}</Text>}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        {asking.cancelLabel && (
          <Button variant="ghost" onPress={() => onAnswer(false)}>
            {asking.cancelLabel}
          </Button>
        )}
        <Button variant={asking.danger ? 'danger' : 'primary'} onPress={() => onAnswer(true)}>
          {asking.confirmLabel}
        </Button>
      </View>
    </>
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
 * Slides up as Telegram's bulletins do (`above` the tab bar, or the bottom edge on a dialog or screen) and slides
 * away by itself. With `undo`, it has an Undo button and a ring counting the seconds left; a new strip replaces the
 * one showing. Moved to another window, it carries on with the time left.
 */
function Snackbar({ toast, onDone, above }: { toast: Bulletin | null; onDone(): void; above: number }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const y = useSharedValue(1);
  const left = useSharedValue(1);
  const [seconds, setSeconds] = useState(0);
  const done = useCallback(onDone, [onDone]);
  useEffect(() => {
    if (!toast) return;
    const end = toast.until;
    const remaining = Math.max(0, end - Date.now());
    // Only a new strip slides in; one moving here from a window that closed just stays.
    if (remaining > toast.ms - 150) {
      y.value = 1;
      y.value = withTiming(0, { duration: DURATION.normal, easing: EASE_OUT });
    } else {
      y.value = 0;
    }
    left.value = remaining / toast.ms;
    left.value = withTiming(0, { duration: remaining, easing: Easing.linear });
    setSeconds(Math.ceil(remaining / 1000));
    const tick = setInterval(() => setSeconds(Math.max(0, Math.ceil((end - Date.now()) / 1000))), 250);
    const timer = setTimeout(() => {
      y.value = withTiming(1, { duration: DURATION.quick, easing: EASE_IN }, (finished) => {
        if (finished) runOnJS(done)();
      });
    }, remaining);
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
    <Animated.View pointerEvents="box-none" accessibilityLiveRegion="polite" style={[styles.snackWrap, { bottom: above + insets.bottom }, slide]}>
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
