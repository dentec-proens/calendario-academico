import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Whether the element is narrower than `threshold`; false until the first measurement.
 * `onChange` runs before the re-render, while the outgoing layout still holds focus.
 */
export function useNarrowContainer(
  ref: RefObject<HTMLElement | null>,
  threshold: number,
  onChange?: (narrow: boolean) => void,
) {
  const [narrow, setNarrow] = useState(false);
  const callback = useRef(onChange);
  useEffect(() => {
    callback.current = onChange;
  });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let current = false;
    // The editor sidebar takes room until a viewport breakpoint, so measure the step itself.
    const observer = new ResizeObserver(([entry]) => {
      // A step without width is hidden or not laid out, not narrow; keep the current layout.
      if (!entry?.contentRect.width) return;
      const next = entry.contentRect.width < threshold;
      if (next === current) return;
      current = next;
      callback.current?.(next);
      setNarrow(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, threshold]);
  return narrow;
}
