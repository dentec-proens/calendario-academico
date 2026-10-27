import { useEffect, useRef, type ReactNode, type ComponentProps } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button.tsx';

/** Presentation only: closing never decides whether the caller keeps or discards its draft. */
export function PanelDialog({
  open,
  onClose,
  returnFocus,
  children,
  className = '',
  ...props
}: Omit<ComponentProps<'dialog'>, 'open' | 'onClose' | 'onCancel'> & {
  open: boolean;
  onClose: () => void;
  returnFocus?: () => HTMLElement | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const focusFallback = useRef(returnFocus);
  useEffect(() => {
    focusFallback.current = returnFocus;
  });
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      dialog.close();
      document.documentElement.style.overflow = previousOverflow;
      const target =
        previousFocus instanceof HTMLElement &&
        previousFocus.isConnected &&
        previousFocus !== document.body &&
        previousFocus.getClientRects().length
          ? previousFocus
          : focusFallback.current?.();
      target?.focus({ preventScroll: true });
    };
  }, [open]);
  return (
    <dialog
      {...props}
      ref={dialogRef}
      className={`ui-panel-dialog ${className}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {children}
    </dialog>
  );
}

export function PanelHeader({
  title,
  titleId,
  closeId,
  onClose,
  disabled = false,
}: {
  title: ReactNode;
  titleId: string;
  closeId: string;
  onClose: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="ui-panel-header">
      <h2 id={titleId} tabIndex={-1}>
        {title}
      </h2>
      <Button
        id={closeId}
        variant="secondary"
        aria-label="Fechar painel"
        disabled={disabled}
        onClick={onClose}
      >
        <X aria-hidden="true" size={20} />
      </Button>
    </div>
  );
}
