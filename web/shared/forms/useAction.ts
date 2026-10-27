import type { WorkRisk } from '../../app/updates/work.ts';
import { useFormDrafts } from './drafts.tsx';
import { useRef, useState } from 'react';
import { nativeError } from '../convex/errors.ts';
import type { Notify } from '../convex/types.ts';

// The ref also blocks a second click before React renders the pending state.
export function useAction(notify: Notify, risk: WorkRisk = { kind: 'operation', loss: true }) {
  const protection = useFormDrafts()?.protection;
  const busy = useRef(false);
  const [pending, setPending] = useState(false);

  function run(action: () => Promise<void>): void {
    if (busy.current || protection?.locked) return;
    const operation = protection?.begin(risk);
    busy.current = true;
    setPending(true);
    void Promise.resolve()
      .then(action)
      .catch((error: unknown) => notify(nativeError(error).message, true))
      .finally(() => {
        if (operation) protection?.finish(operation);
        busy.current = false;
        setPending(false);
      });
  }

  return { pending, run };
}
