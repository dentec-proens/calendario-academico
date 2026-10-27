export interface Version {
  schemaVersion: 1;
  buildId: string;
}
export interface Detection {
  own: string;
  observed: { buildId: string; at: number } | null;
  checking: boolean;
  failure: boolean;
}
export function parseVersion(text: string): Version {
  if (text.length > 1024) throw new Error('Oversized version manifest');
  const value: unknown = JSON.parse(text);
  if (
    !value ||
    typeof value !== 'object' ||
    !('schemaVersion' in value) ||
    value.schemaVersion !== 1 ||
    !('buildId' in value) ||
    typeof value.buildId !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(value.buildId)
  )
    throw new Error('Invalid version manifest');
  return { schemaVersion: 1, buildId: value.buildId };
}
export function recentDifference(snapshot: Detection, now = Date.now()) {
  return Boolean(
    snapshot.observed &&
    snapshot.observed.buildId !== snapshot.own &&
    !snapshot.failure &&
    now - snapshot.observed.at <= 30_000 &&
    now >= snapshot.observed.at,
  );
}

export function createVersionDetector(own: string, transport = fetch, now = Date.now) {
  let snapshot: Detection = { own, observed: null, checking: false, failure: false };
  let lastStart = -Infinity;
  let pending: Promise<void> | undefined;
  let controller: AbortController | undefined;
  let generation = 0;
  const listeners = new Set<() => void>();
  const publish = (changes: Partial<Detection>) => {
    snapshot = { ...snapshot, ...changes };
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    check(force = false): Promise<void> {
      if (pending) return pending;
      if (!own || (!force && now() - lastStart < 15_000)) return Promise.resolve();
      lastStart = now();
      const run = ++generation;
      const active = new AbortController();
      controller = active;
      const signal = active.signal;
      const timer = setTimeout(() => active.abort(), 5000);
      publish({ checking: true });
      pending = (async () => {
        try {
          const response = await transport('/version.json', {
            cache: 'no-store',
            redirect: 'error',
            signal,
            credentials: 'same-origin',
          });
          if (
            !response.ok ||
            response.redirected ||
            !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '') ||
            Number(response.headers.get('content-length') ?? 0) > 1024
          )
            throw new Error('Invalid version response');
          // Bound the actual stream as well as the optional Content-Length.
          const reader = response.body?.getReader();
          if (!reader) throw new Error('Empty version response');
          const decoder = new TextDecoder();
          let text = '';
          let size = 0;
          try {
            for (;;) {
              const part = await reader.read();
              if (part.done) break;
              size += part.value.byteLength;
              if (size > 1024) throw new Error('Oversized version response');
              text += decoder.decode(part.value, { stream: true });
            }
            text += decoder.decode();
          } finally {
            await reader.cancel();
          }
          if (signal.aborted) throw new Error('Version check aborted');
          const version = parseVersion(text);
          if (run === generation && !signal.aborted)
            publish({ observed: { buildId: version.buildId, at: now() }, failure: false });
        } catch {
          if (run === generation) publish({ failure: true });
        } finally {
          clearTimeout(timer);
          if (run === generation) {
            pending = undefined;
            publish({ checking: false });
          }
        }
      })();
      return pending;
    },
    invalidate() {
      generation++;
      controller?.abort();
      pending = undefined;
      publish({ observed: null, checking: false });
    },
    dispose() {
      generation++;
      controller?.abort();
      pending = undefined;
      publish({ checking: false });
    },
  };
}
