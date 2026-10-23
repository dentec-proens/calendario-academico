export type AutosaveStatus = 'scheduled' | 'saving' | 'pending' | 'saved' | 'blocked' | 'error';

export interface AutosaverOptions<Snapshot, Result> {
  isDirty: () => boolean;
  snapshot: () => Snapshot;
  write: (sent: Snapshot) => Promise<Result>;
  onSaved: (result: Result, sent: Snapshot) => void;
  onStatus: (status: AutosaveStatus, detail?: unknown) => void;
}

export function createAutosaver<Snapshot, Result>({
  isDirty,
  snapshot,
  write,
  onSaved,
  onStatus,
}: AutosaverOptions<Snapshot, Result>) {
  let pending: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let blocked = false;
  let paused = false;
  let lastError: unknown;

  function cancelScheduled() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function schedule() {
    cancelScheduled();
    if (blocked || paused || !isDirty()) return;
    if (!pending) onStatus('scheduled');
    timer = setTimeout(() => {
      timer = null;
      void save();
    }, 1500);
  }

  function save(manual = false) {
    cancelScheduled();
    if (pending) return pending;
    if (blocked) {
      onStatus('blocked', lastError);
      return Promise.resolve();
    }
    if (paused && !manual) return Promise.resolve();
    if (!isDirty() && !manual) return Promise.resolve();
    paused = false;
    const sent = structuredClone(snapshot());
    onStatus('saving');
    pending = Promise.resolve()
      .then(() => write(sent))
      .then((result) => {
        onSaved(result, sent);
        onStatus(isDirty() ? 'pending' : 'saved', result);
      })
      .catch((error: unknown) => {
        lastError = error;
        const status =
          error && typeof error === 'object' && 'status' in error ? error.status : undefined;
        blocked = status === 409 || status === 401;
        paused = !blocked;
        cancelScheduled();
        onStatus(blocked ? 'blocked' : 'error', error);
      })
      .finally(() => {
        pending = null;
        // An edit may arrive while a write is pending, even after its timer fires.
        if (!isDirty()) cancelScheduled();
        else if (timer === null && !blocked && !paused) schedule();
      });
    return pending;
  }

  return { save, schedule };
}
