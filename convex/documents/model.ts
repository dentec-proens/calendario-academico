import { iso } from '../lib/shared';
import type { documentSnapshot } from '../validators';
import type { Infer } from 'convex/values';

export function documentDto(row: Infer<typeof documentSnapshot>) {
  const { createdAt, publishedAt, archivedAt, ...fields } = row;
  return {
    ...fields,
    createdAt: iso(createdAt),
    ...(publishedAt !== undefined ? { publishedAt: iso(publishedAt) } : {}),
    ...(archivedAt !== undefined ? { archivedAt: iso(archivedAt) } : {}),
  };
}
