import { useEffect, useRef, useState, type RefObject } from 'react';

const scrollbarMargin = 24;

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
      const { width } = entry.contentRect;
      // A modal panel removes the page scrollbar and widens the step, which must not switch the
      // layout (and close that panel): going back to wide needs more than a scrollbar's width.
      const next = current ? width < threshold + scrollbarMargin : width < threshold;
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
