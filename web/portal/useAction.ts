import { useRef, useState } from 'react';
import { nativeError } from '../native/client.ts';
import type { Notify } from '../native/types.ts';

// The ref also blocks a second click before React renders the pending state.
export function useAction(notify: Notify) {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);

  function run(action: () => Promise<void>): void {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    void Promise.resolve()
      .then(action)
      .catch((error: unknown) => notify(nativeError(error).message, true))
      .finally(() => {
        busy.current = false;
        setPending(false);
      });
  }

  return { pending, run };
}
