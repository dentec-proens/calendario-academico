let insetElement: HTMLElement | null = null;

function updateScrollInset() {
  const inset = insetElement?.getBoundingClientRect().height ?? 0;
  document.documentElement.style.setProperty('--scroll-inset-top', `${inset}px`);
  return inset;
}

/** Reserve the actual height of a sticky status area, including when its text wraps. */
export function trackScrollInset(element: HTMLElement) {
  insetElement = element;
  const observer = new ResizeObserver(updateScrollInset);
  observer.observe(element);
  updateScrollInset();
  return () => {
    observer.disconnect();
    if (insetElement === element) {
      insetElement = null;
      updateScrollInset();
    }
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
