const insetElements = new Set<HTMLElement>();

/**
 * Stack the tracked sticky areas in document order: each one receives `--sticky-top`, the height of
 * the areas above it, and the page receives `--scroll-inset-top`, the height of all of them.
 */
function updateScrollInset() {
  let inset = 0;
  const ordered = [...insetElements].sort((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  );
  for (const element of ordered) {
    element.style.setProperty('--sticky-top', `${inset}px`);
    inset += element.getBoundingClientRect().height;
  }
  document.documentElement.style.setProperty('--scroll-inset-top', `${inset}px`);
  return inset;
}

/** Reserve the actual height of a sticky status area, including when its text wraps. */
export function trackScrollInset(element: HTMLElement) {
  insetElements.add(element);
  const observer = new ResizeObserver(updateScrollInset);
  observer.observe(element);
  updateScrollInset();
  return () => {
    observer.disconnect();
    insetElements.delete(element);
    element.style.removeProperty('--sticky-top');
    updateScrollInset();
  };
}

/** Reveal content below sticky feedback and respect the user's current motion preference. */
export function scrollIntoView(
  element: Element | null | undefined,
  options: ScrollIntoViewOptions = {},
) {
  if (!element) return;
  const inset = updateScrollInset();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Centering a tall form can leave its heading and first controls above the viewport.
  const block =
    element.getBoundingClientRect().height > window.innerHeight - inset - 32
      ? 'start'
      : options.block;
  element.scrollIntoView({
    ...options,
    block,
    behavior: reducedMotion ? 'instant' : options.behavior,
  });
}
