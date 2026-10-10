import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Pressable } from './Pressable';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { DURATION, EASE_IN, EASE_OUT, SPRING } from '../../lib/motion';
import { useColors } from '../../theme';
import { Icon, type IconName } from './Icon';
import { PressScale } from './PressScale';

/**
 * - `sheet`: Android's own bottom sheet (draggable). For choices and short forms.
 * - `dialog`: a centred box.
 * - `screen`: fills the screen. For views with their own lists.
 */
export type SheetKind = 'sheet' | 'dialog' | 'screen';

interface SheetProps {
  kind?: SheetKind;
  /** Kept for parity with the old app; the sheet's width follows the screen. */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  onClose(): void;
  /** What Back does, if not `onClose` (e.g. go back a step first). */
  onBack?(): void;
  /** False while something on top of this sheet handles Back itself. */
  backEnabled?: boolean;
  /** While saving or sharing: Back and taps outside do nothing. */
  busy?: boolean;
  /** Tap outside (or drag down) to close. Only for sheets without typed input, so a stray tap never loses what was typed. */
  closeOnBackdrop?: boolean;
  /** A `screen` whose content scrolls inside itself keeps a fixed height; unused here, kept for parity. */
  tall?: boolean;
  layer?: 'under' | 'top';
  label?: string;
  /** False when the content scrolls inside itself (a fixed header over a list). */
  scroll?: boolean;
  /** False keeps it hidden but loaded, so what was typed in it survives closing it. */
  open?: boolean;
  /** Padding between the edge and the content (the old `className="p-4 gap-4"`). */
  padding?: number;
  gap?: number;
  children: ReactNode;
}

/**
 * The one way to show something over the app. A `sheet` is Android's bottom sheet; a `dialog` and a `screen` are
 * native dialogs, so Back, the status bar and the gesture bar are handled by Android.
 */
export function Sheet({ kind = 'sheet', onClose, onBack, backEnabled = true, busy = false, closeOnBackdrop = false, scroll = true, open = true, label, padding = 16, gap = 12, children }: SheetProps) {
  const c = useColors();
  const handleBack = busy ? undefined : (onBack ?? onClose);
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const screenBack = useRef<() => void>(undefined);
  const body = (maxHeight?: number) => {
    // Without its own scrolling the content shrinks to the box, so a list inside it can scroll under a fixed button.
    const inner = <View style={{ padding, gap, paddingBottom: padding + (kind === 'sheet' ? insets.bottom : 0), flexShrink: scroll ? undefined : 1 }}>{children}</View>;
    return scroll ? (
      <ScrollView keyboardShouldPersistTaps="handled" style={maxHeight ? { maxHeight } : { flex: 1 }} contentContainerStyle={{ flexGrow: kind === 'screen' ? 1 : 0 }}>
        {inner}
      </ScrollView>
    ) : (
      <View style={maxHeight ? { maxHeight } : { flex: 1 }}>{inner}</View>
    );
  };

  if (kind === 'sheet') {
    return (
      <BottomSheet open={open} onClose={onClose} onBack={backEnabled ? handleBack : undefined} dismissible={closeOnBackdrop && !busy} background={c.white} label={label}>
        {body(height * 0.9)}
      </BottomSheet>
    );
  }
  const back = () => backEnabled && handleBack?.();
  return (
    // Android sends Back to the Modal (not to BackHandler): a screen hands it to SlideScreen, which slides out first.
    <Modal visible={open} transparent animationType={kind === 'dialog' ? 'fade' : 'none'} statusBarTranslucent navigationBarTranslucent onRequestClose={() => (kind === 'screen' ? screenBack.current?.() : back())}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          {kind === 'dialog' ? (
            <Pressable android_ripple={null} style={[styles.backdrop, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]} onPress={closeOnBackdrop && !busy ? onClose : undefined} accessibilityLabel={label}>
              <PopIn>
                <Pressable android_ripple={null} style={[styles.dialog, { backgroundColor: c.white, maxHeight: height * 0.9 }]}>{body(height * 0.8)}</Pressable>
              </PopIn>
            </Pressable>
          ) : (
            <SlideScreen backRef={screenBack} open={open} onBack={backEnabled ? handleBack : undefined} closes={!onBack} background={c.white} scrim={c.scrim} label={label}>
              <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>{body()}</View>
            </SlideScreen>
          )}
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </Modal>
  );
}

/** Lets SheetHeader's close button play the screen's slide-out before it closes. */
const SheetMotion = createContext<{ leave(then: () => void): void } | null>(null);

/** A dialog's box: grows from slightly smaller as it fades in (Telegram's alerts). */
function PopIn({ children }: { children: ReactNode }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withSpring(1, SPRING);
  }, [v]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 0.9 + 0.1 * v.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/**
 * A full screen, as Telegram opens one: it slides in from the right over the dimmed app, Back or the close button
 * slides it out, and a swipe from the left edge drags it away (let go past a third, or flick, to close).
 */
function SlideScreen({ backRef, open, onBack, closes, background, scrim, label, children }: { backRef: { current?: () => void }; open: boolean; onBack?: () => void; closes: boolean; background: string; scrim: string; label?: string; children: ReactNode }) {
  const { width } = useWindowDimensions();
  const x = useSharedValue(width);
  useEffect(() => {
    if (open) x.value = withTiming(0, { duration: DURATION.screen, easing: EASE_OUT });
    else x.value = width;
  }, [open, width, x]);

  // Out to the right, then close. Going back a step inside the screen (onBack) has no slide.
  const leave = (then: () => void) => {
    x.value = withTiming(width, { duration: DURATION.normal, easing: EASE_IN }, (done) => {
      if (done) runOnJS(then)();
    });
  };
  const back = () => {
    if (!onBack) return;
    if (closes) leave(onBack);
    else onBack();
  };
  backRef.current = back;

  const swipe = Gesture.Pan()
    .enabled(!!onBack && closes)
    .activeOffsetX(12)
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      x.value = Math.max(0, e.translationX);
    })
    .onEnd((e) => {
      if (x.value > width / 3 || e.velocityX > 800) {
        x.value = withTiming(width, { duration: DURATION.quick, easing: EASE_IN }, (done) => {
          if (done && onBack) runOnJS(onBack)();
        });
      } else {
        x.value = withSpring(0, SPRING);
      }
    });

  const screen = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const dim = useAnimatedStyle(() => ({ opacity: 0.4 * (1 - x.value / width) }));
  return (
    <SheetMotion.Provider value={closes ? { leave } : null}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: scrim }, dim]} />
      <Animated.View accessibilityLabel={label} style={[{ flex: 1, backgroundColor: background, elevation: 16 }, screen]}>
        {children}
        {/* The edge to swipe from, so swiping inside lists and sliders still works. */}
        <GestureDetector gesture={swipe}>
          <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 24 }} />
        </GestureDetector>
      </Animated.View>
    </SheetMotion.Provider>
  );
}

/** TrueSheet shown while `open`; its content stays mounted while hidden. */
function BottomSheet({ open, onClose, onBack, dismissible, background, label, children }: { open: boolean; onClose(): void; onBack?: () => void; dismissible: boolean; background: string; label?: string; children: ReactNode }) {
  const ref = useRef<TrueSheet>(null);
  const shown = useRef(false);
  const wanted = useRef(open);
  wanted.current = open;
  useEffect(() => {
    if (open && !shown.current) {
      shown.current = true;
      void ref.current?.present();
    } else if (!open && shown.current) {
      void ref.current?.dismiss();
    }
  }, [open]);
  return (
    <TrueSheet
      ref={ref}
      detents={['auto']}
      dimmed
      grabber
      cornerRadius={16}
      backgroundColor={background}
      dismissible={dismissible}
      accessibilityLabel={label}
      scrollable
      onBackPress={() => {
        onBack?.();
        return true;
      }}
      onDidDismiss={() => {
        shown.current = false;
        // Dragged or tapped away while it was meant to stay open.
        if (wanted.current) onClose();
      }}
    >
      {children}
    </TrueSheet>
  );
}

/** Title (and a line under it) with a close button: the top of most sheets. */
export function SheetHeader({
  title,
  subtitle,
  icon,
  onClose,
  closeDisabled,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: IconName;
  onClose?(): void;
  closeDisabled?: boolean;
  /** Extra buttons beside the close button. */
  children?: ReactNode;
}) {
  const c = useColors();
  const motion = useContext(SheetMotion);
  const close = onClose && (motion ? () => motion.leave(onClose) : onClose);
  return (
    <View style={styles.header}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.titleRow}>
          {icon && <Icon name={icon} size={18} color={c.orange500} />}
          <Text accessibilityRole="header" style={[styles.title, { color: c.gray900 }]}>
            {title}
          </Text>
        </View>
        {subtitle ? <Text style={[styles.subtitle, { color: c.gray500 }]}>{subtitle}</Text> : null}
      </View>
      <View style={styles.headerButtons}>
        {children}
        {onClose && (
          <Pressable accessibilityRole="button" accessibilityLabel="Close" disabled={closeDisabled} onPress={close} hitSlop={4} style={[styles.close, closeDisabled && { opacity: 0.4 }]}>
            <Icon name="close" size={22} color={c.gray500} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** Small heading over a sheet's choices ("Share BOQ as"). */
export function SheetLabel({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text style={{ fontSize: 12, fontWeight: '700', color: c.gray500, paddingHorizontal: 4 }}>{children}</Text>;
}

/** One choice in a sheet: icon, name and a line about it. */
export function SheetOption({ icon, label, about, busy, onPress, disabled }: { icon: IconName; label: ReactNode; about?: ReactNode; busy?: boolean; onPress?(): void; disabled?: boolean }) {
  const c = useColors();
  return (
    <PressScale
      scaleTo={0.98}
      accessibilityRole="button"
      disabled={disabled || busy}
      onPress={onPress}
      style={[styles.option, { backgroundColor: c.gray50, opacity: disabled ? 0.5 : 1 }]}
    >
      <Icon name={busy ? 'hourglass-empty' : icon} size={22} color={c.orange500} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: c.gray800 }}>{label}</Text>
        {about ? <Text style={{ fontSize: 12, color: c.gray500 }}>{about}</Text> : null}
      </View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', paddingHorizontal: 16 },
  dialog: { borderRadius: 16, overflow: 'hidden', width: '100%', maxWidth: 440, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flexShrink: 1, fontSize: 14, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 2 },
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  close: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center', marginRight: -8, marginTop: -8 },
  option: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12 },
});
