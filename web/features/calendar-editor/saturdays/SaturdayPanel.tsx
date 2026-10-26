import { useEffect, useRef, type ReactNode } from 'react';

/**
 * In a narrow step the panel is a modal dialog, so its fields never sit far below the dates or
 * cover the grid while it scrolls. Beside a wide grid it is a plain sticky aside instead.
 */
export default function SaturdayPanel({
  open,
  label,
  returnFocus,
  onClose,
  children,
}: {
  open: boolean;
  label: string;
  /** Where focus goes on close when the control that opened the dialog is gone. */
  returnFocus: () => HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fallback = useRef(returnFocus);
  useEffect(() => {
    fallback.current = returnFocus;
  });
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const previousFocus = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      // A resize can open the dialog after the focused aside left, leaving only the body behind.
      const opener =
        previousFocus instanceof HTMLElement &&
        previousFocus.isConnected &&
        previousFocus !== document.body
          ? previousFocus
          : fallback.current();
      opener?.focus();
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
