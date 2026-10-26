import { useCallback, useEffect, useRef } from 'react';

type Request = { target: () => HTMLElement | null; preventScroll: boolean };

/**
 * Focus an element that only exists after the next render, such as the successor of a control
 * that leaves the page. The request waits until its target appears.
 */
export function useDeferredFocus() {
  const pending = useRef<Request | null>(null);
  useEffect(() => {
    const request = pending.current;
    const target = request?.target();
    if (!request || !target) return;
    pending.current = null;
    target.focus({ preventScroll: request.preventScroll });
  });
  return useCallback(
    (target: () => HTMLElement | null, options: { preventScroll?: boolean } = {}) => {
      pending.current = { target, preventScroll: options.preventScroll ?? false };
    },
    [],
  );
}
