import type React from 'react';

/**
 * - `primary` (orange): the one main action on a screen or sheet.
 * - `secondary` (white, grey outline): other actions.
 * - `danger` (red): confirming a delete or clear.
 * - `dangerOutline` (red outline): a Delete button beside other actions.
 * - `ghost` (no background): Cancel and other quiet actions.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'dangerOutline' | 'ghost';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--color-brand-primary)] text-white shadow-sm hover:brightness-105',
  secondary: 'bg-white border border-gray-200 text-gray-800 shadow-sm hover:bg-gray-50',
  danger: 'bg-red-600 text-[#fff] shadow-sm hover:bg-red-700',
  dangerOutline: 'bg-white border border-red-200 text-red-600 shadow-sm hover:bg-red-50',
  ghost: 'text-gray-500 hover:bg-gray-100',
};
const SIZE = { sm: 'h-9 px-3 text-xs', md: 'h-11 px-4 text-xs' };

export function Button({
  variant = 'secondary',
  size = 'md',
  block,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: keyof typeof SIZE;
  /** Full width. */
  block?: boolean;
}) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-bold uppercase tracking-wide whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none ${VARIANT[variant]} ${SIZE[size]} ${block ? 'w-full' : ''} ${className}`}
    />
  );
}
