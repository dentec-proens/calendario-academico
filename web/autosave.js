export function createAutosaver({ isDirty, snapshot, write, onSaved, onStatus }) {
  let pending = null,
    timer = null,
    blocked = false,
    paused = false,
    lastError;

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
      .catch((error) => {
        lastError = error;
        blocked = error.status === 409 || error.status === 401;
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

export async function saveCalendarSnapshot(url, body, { fetcher = fetch, timeoutMs = 45000 } = {}) {
  try {
    const response = await fetcher(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Dentec-Request': '1' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
    if (!response.ok)
      throw Object.assign(
        Error(data?.error || 'O servidor está indisponível. Suas alterações continuam nesta tela.'),
        { status: response.status },
      );
    if (!data || typeof data.version !== 'number')
      throw Error('O servidor não confirmou o salvamento.');
    return data;
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError')
      throw Error(
        'O servidor não confirmou o salvamento a tempo. Antes de tentar novamente, baixe uma cópia de segurança.',
        { cause: error },
      );
    throw error;
  }
}
