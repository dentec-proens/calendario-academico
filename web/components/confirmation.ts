export type DialogIntent = 'danger' | 'primary' | 'warning' | 'success';

export interface ConfirmationOptions {
  title: string;
  description: string;
  consequence?: string;
  intent?: DialogIntent;
  confirmLabel: string;
  cancelLabel?: string;
  pendingLabel?: string;
  onConfirm?: () => Promise<void>;
}

export interface ConfirmationRequest extends ConfirmationOptions {
  id: number;
  finish: (confirmed: boolean) => void;
}

let current: ConfirmationRequest | null = null;
let sequence = 0;
const listeners = new Set<() => void>();

export function subscribeConfirmation(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getConfirmation() {
  return current;
}

/** A second request never replaces an unanswered decision or repeats its action. */
export function confirmAction(options: ConfirmationOptions): Promise<boolean> {
  if (current) return Promise.resolve(false);
  return new Promise((resolve) => {
    const request: ConfirmationRequest = {
      ...options,
      id: ++sequence,
      finish(confirmed) {
        if (current !== request) return;
        current = null;
        listeners.forEach((listener) => listener());
        resolve(confirmed);
      },
    };
    current = request;
    listeners.forEach((listener) => listener());
  });
}
