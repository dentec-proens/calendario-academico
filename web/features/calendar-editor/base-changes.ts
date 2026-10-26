import { equalValues } from '../../../src/equal.ts';

export function baseChanges<T extends { id: string }>(previous: T[], current: T[]) {
  const before = new Map(previous.map((item) => [item.id, item]));
  const after = new Map(current.map((item) => [item.id, item]));
  return {
    added: current.filter((item) => !before.has(item.id)),
    changed: current.flatMap((item) => {
      const old = before.get(item.id);
      return old && !equalValues(old, item) ? [{ before: old, after: item }] : [];
    }),
    removed: previous.filter((item) => !after.has(item.id)),
  };
}
