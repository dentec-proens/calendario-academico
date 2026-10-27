import { useEffect, type RefObject } from 'react';
import { scrollIntoView } from '../scroll.ts';

/**
 * After a sign-in, moves focus to the destination's page title once the access form is gone and
 * the title has rendered, so the new page is announced instead of a confirmation message. A page
 * that already placed focus elsewhere keeps it.
 */
export function useArrivalFocus(
  main: RefObject<HTMLElement | null>,
  pending: boolean,
  done: () => void,
) {
  useEffect(() => {
    const root = main.current;
    if (!pending || !root) return;
    const arrive = () => {
      if (root.querySelector('#auth')) return false;
      const title = root.querySelector<HTMLElement>('h1');
      if (!title) return false;
      const active = document.activeElement;
      if (!active || active === document.body) {
        title.focus({ preventScroll: true });
        scrollIntoView(title, { block: 'start' });
      }
      done();
      return true;
    };
    if (arrive()) return;
    const observer = new MutationObserver(() => {
      if (arrive()) observer.disconnect();
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [main, pending, done]);
}
