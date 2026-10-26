import type { Doc } from '../_generated/dataModel';
import type { Context } from '../lib/shared';
import { fail, iso } from '../lib/shared';
import type { documentSnapshot } from '../validators';
import type { Infer } from 'convex/values';

export function documentValue(row: Doc<'documents'>): Infer<typeof documentSnapshot> {
  const { _id, _creationTime: _at, ...fields } = row;
  return { id: _id, ...fields };
}

export function documentDto(row: Infer<typeof documentSnapshot>) {
  const { createdAt, publishedAt, archivedAt, ...fields } = row;
  return {
    ...fields,
    createdAt: iso(createdAt),
    ...(publishedAt !== undefined ? { publishedAt: iso(publishedAt) } : {}),
    ...(archivedAt !== undefined ? { archivedAt: iso(archivedAt) } : {}),
  };
}

export async function currentDocuments(ctx: Context, year: number) {
  const groups = await Promise.all(
    (['norma', 'referencia', 'parecer'] as const).map((type) =>
      ctx.db
        .query('documents')
        .withIndex('by_year_and_type_and_status', (q) =>
          q.eq('year', year).eq('type', type).eq('status', 'vigente'),
        )
        .take(2),
    ),
  );
  if (groups.some((rows) => rows.length > 1))
    fail('Há mais de um documento vigente do mesmo tipo e ano. Confira a base institucional.');
  return groups.flat().map(documentValue);
}
