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
  let disposed = false;
  let suspended = false;
  let authenticationRevision = 0;

  function errorStatus(error: unknown) {
    return error && typeof error === 'object' && 'status' in error ? error.status : undefined;
  }

  function cancelScheduled() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function schedule() {
    cancelScheduled();
    if (disposed || suspended || blocked || paused || !isDirty()) return;
    if (!pending) onStatus('scheduled');
    timer = setTimeout(() => {
      timer = null;
      void save();
    }, 1500);
  }

  function save(manual = false) {
    cancelScheduled();
    if (disposed || suspended) return Promise.resolve();
    if (pending) return pending;
    if (blocked) {
      onStatus('blocked', lastError);
      return Promise.resolve();
    }
    if (paused && !manual) return Promise.resolve();
    if (!isDirty() && !manual) return Promise.resolve();
    paused = false;
    const sent = structuredClone(snapshot());
    const sentAuthentication = authenticationRevision;
    onStatus('saving');
    pending = Promise.resolve()
      .then(() => write(sent))
      .then((result) => {
        if (disposed) return;
        onSaved(result, sent);
        onStatus(isDirty() ? 'pending' : 'saved', result);
      })
      .catch((error: unknown) => {
        if (disposed) return;
        lastError = error;
        const status = errorStatus(error);
        // A response from the expired credentials may arrive after reauthentication.
        if (status === 401 && sentAuthentication !== authenticationRevision && !suspended) {
          blocked = false;
          paused = false;
          lastError = undefined;
          onStatus('pending');
          return;
        }
        blocked = status === 409 || status === 401;
        paused = !blocked;
        cancelScheduled();
        onStatus(blocked ? 'blocked' : 'error', error);
      })
      .finally(() => {
        pending = null;
        // An edit may arrive while a write is pending, even after its timer fires.
        if (!isDirty()) cancelScheduled();
        else if (!disposed && timer === null && !blocked && !paused) schedule();
      });
    return pending;
  }

  async function flush() {
    if (disposed) throw new Error('A sessão de edição foi encerrada.');
    if (suspended) throw new Error('Entre novamente para salvar as alterações.');
    do {
      await save(isDirty());
      if (blocked || paused) throw lastError;
      if (disposed) throw new Error('A sessão de edição foi encerrada.');
      if (suspended) throw new Error('Entre novamente para salvar as alterações.');
    } while (isDirty());
  }

  return {
    save,
    schedule,
    flush,
    setSuspended: (value: boolean) => {
      const reauthenticated = suspended && !value;
      suspended = value;
      if (value) cancelScheduled();
      else {
        if (reauthenticated) authenticationRevision++;
        if (reauthenticated && blocked && errorStatus(lastError) === 401) {
          blocked = false;
          paused = false;
          lastError = undefined;
          onStatus(isDirty() ? 'pending' : 'saved');
        }
        schedule();
      }
    },
    resume: () => {
      if (disposed) throw new Error('A sessão de edição foi encerrada.');
      blocked = false;
      paused = false;
      lastError = undefined;
    },
    dispose: () => {
      disposed = true;
      cancelScheduled();
    },
  };
}
