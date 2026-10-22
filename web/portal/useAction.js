import { useRef, useState } from 'react';

// The ref also blocks a second click before React renders the pending state.
export function useAction(notify) {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);

  async function run(action) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      await action();
    } catch (error) {
      notify(error.message, true);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return { pending, run };
}
