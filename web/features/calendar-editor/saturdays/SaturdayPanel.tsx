import { useEffect, useRef, type ReactNode } from 'react';

/**
 * In a narrow step the panel is a modal dialog, so its fields never sit far below the dates or
 * cover the grid while it scrolls. Beside a wide grid it is a plain sticky aside instead.
 */
export default function SaturdayPanel({
  open,
  label,
  onClose,
  children,
}: {
  open: boolean;
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const previousFocus = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [open]);
  return (
    <dialog
      id="saturday-panel"
      ref={dialogRef}
      aria-label={label}
      onCancel={(event) => {
        // Escape closes through state, so React keeps owning whether the dialog is open.
        event.preventDefault();
        onClose();
      }}
    >
      {children}
    </dialog>
  );
}
