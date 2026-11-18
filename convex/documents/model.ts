import { iso } from '../lib/shared';
import type { documentSnapshot } from '../validators';
import type { Infer } from 'convex/values';

/** A document as clients read it: dates as text, and no account ids, which no screen shows. */
export function documentDto(row: Infer<typeof documentSnapshot>) {
  const {
    createdAt,
    publishedAt,
    archivedAt,
    createdBy: _createdBy,
    publishedBy: _publishedBy,
    ...fields
  } = row;
  return {
    ...fields,
    createdAt: iso(createdAt),
    ...(publishedAt !== undefined ? { publishedAt: iso(publishedAt) } : {}),
    ...(archivedAt !== undefined ? { archivedAt: iso(archivedAt) } : {}),
  };
}
