import type { HTMLAttributes } from 'react';

export function StatusBadge({
  tone = 'neutral',
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: 'neutral' | 'success' | 'warning' }) {
  return (
    <span {...props} className={`ui-status ui-status--${tone}`}>
      {children}
    </span>
  );
}
