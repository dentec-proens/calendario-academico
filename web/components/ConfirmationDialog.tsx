import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { AlertTriangle, CheckCircle2, Info, LoaderCircle, Trash2 } from 'lucide-react';
import {
  getConfirmation,
  beginConfirmationOperation,
  subscribeConfirmation,
  type ConfirmationRequest,
} from './confirmation.ts';
import './confirmation-dialog.css';
import { Notice } from './ui/Notice.tsx';

const icons = { danger: Trash2, primary: Info, warning: AlertTriangle, success: CheckCircle2 };

function ConfirmationDialog({ request }: { request: ConfirmationRequest }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const id = useId();
  const intent = request.intent ?? 'primary';
  const Icon = icons[intent];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    dialog.showModal();
    cancelRef.current?.focus();
    return () => {
      dialog.close();
      document.documentElement.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
      // React may replay effects in development; only a real unmount cancels.
      queueMicrotask(() => {
        if (!dialog.isConnected) request.finish(false);
      });
    };
  }, [request]);

  async function confirm() {
    if (busy.current) return;
    busy.current = true;
    const finishOperation = beginConfirmationOperation();
    setPending(true);
    setError('');
    try {
      await request.onConfirm?.();
      request.finish(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Não foi possível concluir. Tente novamente.',
      );
    } finally {
      finishOperation();
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={`confirmation-dialog confirmation-dialog--${intent}`}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      aria-busy={pending}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const buttons =
          event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy.current) request.finish(false);
      }}
    >
      <div className="confirmation-dialog__body">
        <div className="confirmation-dialog__icon">
          <Icon aria-hidden="true" size={26} />
        </div>
        <h2 id={`${id}-title`}>{request.title}</h2>
        <div id={`${id}-description`}>
          <p>{request.description}</p>
          {request.consequence ? (
            <Notice tone="warning" className="confirmation-dialog__consequence">
              {request.consequence}
            </Notice>
          ) : null}
        </div>
        {error ? (
          <Notice tone="danger" announce="assertive" className="confirmation-dialog__error">
            {error}
          </Notice>
        ) : null}
      </div>
      <div className="confirmation-dialog__actions">
        <button
          ref={cancelRef}
          type="button"
          className="confirmation-dialog__cancel"
          disabled={pending}
          onClick={() => {
            if (!busy.current) request.finish(false);
          }}
        >
          {request.cancelLabel ?? 'Cancelar'}
        </button>
        <button
          type="button"
          className="confirmation-dialog__confirm"
          disabled={pending}
          onClick={() => {
            void confirm();
          }}
        >
          {pending ? (
            <LoaderCircle className="confirmation-dialog__spinner" aria-hidden="true" size={18} />
          ) : null}
          {pending ? (request.pendingLabel ?? 'Aguarde…') : request.confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

export default function ConfirmationDialogHost() {
  const request = useSyncExternalStore(subscribeConfirmation, getConfirmation, () => null);
  return request ? <ConfirmationDialog key={request.id} request={request} /> : null;
}
