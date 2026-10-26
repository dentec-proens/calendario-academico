import { useEffect, useState, type RefObject } from 'react';

/** Whether the element is narrower than `threshold`; false until the first measurement. */
export function useNarrowContainer(ref: RefObject<HTMLElement | null>, threshold: number) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    // The editor sidebar takes room until a viewport breakpoint, so measure the step itself.
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setNarrow(entry.contentRect.width < threshold);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, threshold]);
  return narrow;
}
