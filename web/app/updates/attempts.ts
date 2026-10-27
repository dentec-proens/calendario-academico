interface Attempt {
  from: string;
  target: string;
  at: number;
  count: number;
}
const key = 'portal-update-attempts-v1';
const windowMs = 600_000;
function readAttempts(storage: Pick<Storage, 'getItem'>, now: number): Attempt[] {
  const raw: unknown = JSON.parse(storage.getItem(key) ?? '[]');
  const valid = (item: unknown): item is Attempt =>
    Boolean(
      item &&
      typeof item === 'object' &&
      'from' in item &&
      typeof item.from === 'string' &&
      'target' in item &&
      typeof item.target === 'string' &&
      'at' in item &&
      typeof item.at === 'number' &&
      'count' in item &&
      typeof item.count === 'number',
    );
  if (!Array.isArray(raw) || raw.length > 100 || !raw.every(valid))
    throw new Error('Invalid attempt history');
  return raw.filter((item) => now - item.at < windowMs);
}
export function recordAttempt(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  from: string,
  target: string,
  automatic: boolean,
  now = Date.now(),
  onStorageError = () => {},
) {
  try {
    const attempts = readAttempts(storage, now);
    if (automatic && attempts.some((item) => item.target === target)) return false;
    const previous = attempts.find((item) => item.from === from && item.target === target);
    const next = { from, target, at: now, count: (previous?.count ?? 0) + 1 };
    storage.setItem(key, JSON.stringify([...attempts.filter((item) => item !== previous), next]));
    return true;
  } catch {
    onStorageError();
    return false;
  }
}

/** Construct once per executing document, never once per authenticated identity. */
export function createAttemptPolicy(
  own: string,
  storage: () => Pick<Storage, 'getItem' | 'setItem'>,
  now = Date.now,
) {
  let unavailable = false;
  let returnedToOrigin = false;
  if (own) {
    try {
      // The latest transition is the one that produced this document. Older origins
      // also occur in successful rollbacks (A → B → A), so they are not failures.
      const latest = readAttempts(storage(), now()).at(-1);
      returnedToOrigin = Boolean(latest && latest.target !== own && latest.from === own);
    } catch {
      unavailable = true;
    }
  }
  return {
    returnedToOrigin,
    record(target: string, automatic: boolean) {
      if (unavailable || (automatic && returnedToOrigin)) return false;
      try {
        return recordAttempt(storage(), own, target, automatic, now(), () => {
          unavailable = true;
        });
      } catch {
        unavailable = true;
        return false;
      }
    },
  };
}
