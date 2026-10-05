import type React from 'react';
import { createPortal } from 'react-dom';
import { motion, type TargetAndTransition } from 'motion/react';
import { Loader2, X } from 'lucide-react';
import { useBackHandler } from '../../lib/backButton.ts';

/**
 * - `sheet`: slides up from the bottom on a phone, centred on a tablet. For choices and short forms.
 * - `dialog`: centred box.
 * - `screen`: fills the phone screen, a large centred box on a tablet. For views with their own lists.
 */
export type SheetKind = 'sheet' | 'dialog' | 'screen';

const WIDTH = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-5xl' };

const OVERLAY: Record<SheetKind, string> = {
  sheet: 'items-end md:items-center md:p-4',
  dialog: 'items-center p-4',
  screen: 'items-stretch md:items-center md:p-4',
};
const PANEL: Record<SheetKind, string> = {
  sheet: 'rounded-t-2xl md:rounded-2xl max-h-[92vh]',
  dialog: 'rounded-2xl max-h-[90vh]',
  screen: 'md:rounded-2xl md:max-h-[90vh]',
};
const ENTER: Record<SheetKind, { initial: TargetAndTransition; animate: TargetAndTransition; exit: TargetAndTransition }> = {
  sheet: { initial: { y: 40, opacity: 0 }, animate: { y: 0, opacity: 1 }, exit: { y: 40, opacity: 0 } },
  dialog: { initial: { scale: 0.96, opacity: 0 }, animate: { scale: 1, opacity: 1 }, exit: { scale: 0.96, opacity: 0 } },
  screen: { initial: { y: 16, opacity: 0 }, animate: { y: 0, opacity: 1 }, exit: { y: 16, opacity: 0 } },
};

interface SheetProps {
  kind?: SheetKind;
  size?: keyof typeof WIDTH;
  onClose(): void;
  /** What Back does, if not `onClose` (e.g. go back a step first). */
  onBack?(): void;
  /** False while something on top of this sheet handles Back itself. */
  backEnabled?: boolean;
  /** While saving or sharing: Back and taps outside do nothing. */
  busy?: boolean;
  /** Tap outside to close. Only for sheets without typed input, so a stray tap never loses what was typed. */
  closeOnBackdrop?: boolean;
  /** A `screen` that always fills 90% of a tablet's height (lists that scroll inside), instead of fitting its content. */
  tall?: boolean;
  /** `under`: below other sheets (one opened from it appears on top); `top`: above everything (confirmations). */
  layer?: 'under' | 'top';
  labelledBy?: string;
  label?: string;
  /** False when the content scrolls inside itself (a fixed header over a scrolling list). */
  scroll?: boolean;
  /** False keeps it hidden but loaded, so what was typed in it survives closing it. */
  open?: boolean;
  /** Padding, spacing and layout of the panel. */
  className?: string;
  children: React.ReactNode;
}

const ignore = () => {};
const DIALOG_INSETS = { paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' };
const SCREEN_INSETS = { paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' };

/**
 * The one way to show something over the app: dark backdrop, Back closes it,
 * and it keeps clear of the status bar and Android's gesture bar. Drawn at the
 * top of the page, so a sheet opened from inside another still covers the screen.
 */
export function Sheet({
  kind = 'sheet',
  size = 'md',
  onClose,
  onBack,
  backEnabled = true,
  busy = false,
  closeOnBackdrop = false,
  tall,
  layer,
  scroll = true,
  open = true,
  labelledBy,
  label,
  className = '',
  children,
}: SheetProps) {
  useBackHandler(busy ? ignore : (onBack ?? onClose), backEnabled && open);
  const enter = ENTER[kind];
  const height = kind === 'screen' ? (tall ? 'h-full md:h-[90vh]' : 'h-full md:h-auto') : '';
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className={`${open ? 'flex' : 'hidden'} fixed inset-0 ${layer === 'under' ? 'z-40' : layer === 'top' ? 'z-[100]' : 'z-50'} justify-center bg-black/60 ${OVERLAY[kind]}`}
      // Keep clear of the status bar and the gesture bar (a bottom sheet makes room inside instead).
      style={kind === 'sheet' ? undefined : kind === 'dialog' ? DIALOG_INSETS : SCREEN_INSETS}
      onClick={closeOnBackdrop && !busy ? onClose : undefined}
    >
      <motion.div
        {...enter}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={label}
        className={`bg-white w-full ${WIDTH[size]} ${PANEL[kind]} ${height} shadow-2xl flex flex-col ${scroll ? 'overflow-y-auto' : 'overflow-hidden'} ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
        {/* Room for Android's gesture bar under a bottom sheet. */}
        {kind === 'sheet' && <div aria-hidden className="shrink-0 h-[env(safe-area-inset-bottom)] md:hidden" />}
      </motion.div>
    </motion.div>,
    document.body,
  );
}

/** Title (and a line under it) with a close button: the top of most sheets. */
export function SheetHeader({
  id,
  title,
  subtitle,
  icon,
  onClose,
  closeDisabled,
  children,
}: {
  id?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  onClose?(): void;
  closeDisabled?: boolean;
  /** Extra buttons beside the close button. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex justify-between items-start gap-2">
      <div className="min-w-0">
        <h3 id={id} className="font-bold text-gray-900 text-sm flex items-center gap-2">
          {icon}
          {title}
        </h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {children}
        {onClose && (
          <button onClick={onClose} disabled={closeDisabled} className="p-2.5 -m-1.5 text-gray-500 hover:text-black disabled:opacity-40" aria-label="Close">
            <X size={20} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Small heading over a sheet's choices ("Share BOQ as"). */
export function SheetLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-gray-500 font-bold px-1 pb-1">{children}</p>;
}

/** One choice in a sheet: icon, name and a line about it. */
export function SheetOption({
  icon: Icon,
  label,
  about,
  busy,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: React.ReactNode;
  about?: React.ReactNode;
  /** Shows a spinner in place of the icon. */
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      className="w-full flex items-center gap-3 px-4 py-3 min-h-14 rounded-xl bg-gray-50 hover:bg-gray-100 text-sm font-bold text-gray-800 text-left disabled:opacity-50"
    >
      {busy ? <Loader2 size={20} className="animate-spin text-orange-500 shrink-0" /> : <Icon size={20} className="text-orange-500 shrink-0" />}
      <span>
        {label}
        {about && <span className="block text-xs font-normal text-gray-500">{about}</span>}
      </span>
    </button>
  );
}
