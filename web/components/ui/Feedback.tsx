import type { HTMLAttributes, ReactNode } from 'react';
import { Info } from 'lucide-react';

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

export function Notice({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="ui-notice">
      <Info size={18} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        {children ? <p>{children}</p> : null}
      </div>
    </div>
  );
}
