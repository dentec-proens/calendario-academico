import type { ReactNode } from 'react';

/** The same action spacing in an inline form, an aside or a modal panel. */
export function FormActions({
  children,
  preserveOnClose = false,
}: {
  children: ReactNode;
  preserveOnClose?: boolean;
}) {
  return (
    <div className="form-actions">
      <div className="form-actions__buttons">{children}</div>
      {preserveOnClose && (
        <p className="form-actions__hint">
          Ao fechar, o preenchimento fica disponível para continuar nesta sessão.
        </p>
      )}
    </div>
  );
}
