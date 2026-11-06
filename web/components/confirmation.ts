export type DialogIntent = 'danger' | 'primary' | 'warning' | 'success';

/** A line of the decision with a place to go: choosing it cancels and leads there. */
export interface ConfirmationItem {
  key: string;
  title: string;
  detail?: string;
  badges?: readonly string[];
  onSelect?: () => void;
}

export interface ConfirmationOptions {
  title: string;
  description: string;
  consequence?: string;
  /** What the decision covers item by item, such as the issues still open. */
  items?: readonly (string | ConfirmationItem)[];
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

// Executing actions outlive the dialog that started them; closing is not completion.
const pendingOperations = new Set<symbol>();
export function hasPendingConfirmation() {
  return pendingOperations.size > 0;
}
export function beginConfirmationOperation() {
  const token = Symbol();
  pendingOperations.add(token);
  listeners.forEach((listener) => listener());
  return () => {
    if (pendingOperations.delete(token)) listeners.forEach((listener) => listener());
  };
}
