import { useLayoutEffect } from 'react';
import type { WorkRisk } from '../../app/updates/work.ts';
import { useFormDrafts } from './drafts.tsx';

/** A mounted context with ephemeral information; no values enter the registry. */
export function useWorkRisk(kind: WorkRisk['kind'], active = true, loss = false) {
  const protection = useFormDrafts()?.protection;
  useLayoutEffect(() => {
    if (!active || !protection) return;
    return protection.register(() => ({ kind, loss }));
  }, [protection, kind, active, loss]);
}
