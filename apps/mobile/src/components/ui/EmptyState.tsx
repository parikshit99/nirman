import type React from 'react';

/** What a list shows when it has nothing in it (or nothing matches the filters). */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className = '',
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  title: string;
  /** One or two lines saying where things come from or what to do. */
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`py-12 px-4 text-center ${className}`}>
      <Icon size={36} strokeWidth={1.5} className="mx-auto mb-3 text-gray-400" />
      <p className="text-sm font-bold text-gray-600">{title}</p>
      {children && <div className="text-xs text-gray-500 mt-1 max-w-xs mx-auto leading-relaxed">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
