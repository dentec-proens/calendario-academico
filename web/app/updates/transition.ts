// After this wait the notice offers to cancel. Update fixtures shorten it through Vite's `define`;
// Vite only exposes VITE_ variables from the environment, so real builds keep 10 s.
const delayedAfter: number = import.meta.env.DENTEC_FIXTURE_TRANSITION_DELAY ?? 10_000;

export interface DocumentTransition {
  id: symbol;
  delayed: boolean;
}

/** Navigation belongs to this document, even if authentication remounts its React owners. */
export function createDocumentTransition() {
  let current: DocumentTransition | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const publish = () => listeners.forEach((listener) => listener());
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    begin() {
      if (current) return null;
      const id = Symbol();
      current = { id, delayed: false };
      timer = setTimeout(() => {
        if (current?.id !== id) return;
        current = { id, delayed: true };
        publish();
      }, delayedAfter);
      publish();
      return id;
    },
    finish(id: symbol) {
      if (current?.id !== id) return false;
      clearTimeout(timer);
      current = null;
      publish();
      return true;
    },
  };
}
export const documentTransition = createDocumentTransition();
