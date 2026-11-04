import type { ReactNode } from 'react';

/** The same action spacing in an inline form, an aside or a modal panel. */
export function FormActions({ children }: { children: ReactNode }) {
  return (
    <div className="form-actions">
      <div className="form-actions__buttons">{children}</div>
    </div>
  );
}
