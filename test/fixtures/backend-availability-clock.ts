interface AvailabilityClock {
  advance: (milliseconds: number) => void;
}

declare global {
  interface Window {
    backendAvailabilityClock: AvailabilityClock;
  }
}

// Only the fixture's timeout clock advances; browser rendering and real input remain native.
export function installAvailabilityClock() {
  let now = 0;
  let nextId = -1;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const nativeSetTimeout = window.setTimeout.bind(window);
  const nativeClearTimeout = window.clearTimeout.bind(window);
  Object.defineProperty(window, 'setTimeout', {
    value: (handler: TimerHandler, delay = 0, ...args: unknown[]) => {
      if (typeof handler !== 'function') return nativeSetTimeout(handler, delay);
      const id = nextId--;
      timers.set(id, {
        at: now + Math.max(0, delay),
        callback: () => (handler as (...values: unknown[]) => void)(...args),
      });
      return id;
    },
  });
  Object.defineProperty(window, 'clearTimeout', {
    value: (id: number | undefined) => {
      if (id !== undefined && timers.delete(id)) return;
      nativeClearTimeout(id);
    },
  });
  window.backendAvailabilityClock = {
    advance(milliseconds) {
      const end = now + milliseconds;
      for (let count = 0; ; count++) {
        const next = [...timers].sort((left, right) => left[1].at - right[1].at)[0];
        if (!next || next[1].at > end) break;
        if (count > 10_000) throw new Error('Availability fixture timer loop did not settle.');
        now = next[1].at;
        timers.delete(next[0]);
        next[1].callback();
      }
      now = end;
    },
  };
}
