import type { MutationCtx } from '../_generated/server';
import type { Context } from '../lib/shared';
import { fail } from '../lib/shared';

export async function yearRevision(ctx: Context, year: number) {
  return (
    (
      await ctx.db
        .query('catalogueRevisions')
        .withIndex('by_year', (q) => q.eq('year', year))
        .unique()
    )?.revision ?? 1
  );
}

export async function globalRevision(ctx: Context) {
  return (
    (
      await ctx.db
        .query('institutionSettings')
        .withIndex('by_key', (q) => q.eq('key', 'catalogue'))
        .unique()
    )?.revision ?? 1
  );
}

export async function bumpRevision(ctx: MutationCtx, year: number) {
  const scope = await ctx.db
    .query('catalogueRevisions')
    .withIndex('by_year', (q) => q.eq('year', year))
    .unique();
  const revision = (scope?.revision ?? 1) + 1;
  if (scope) await ctx.db.patch(scope._id, { revision });
  else await ctx.db.insert('catalogueRevisions', { year, revision });
  const global = await ctx.db
    .query('institutionSettings')
    .withIndex('by_key', (q) => q.eq('key', 'catalogue'))
    .unique();
  if (global) await ctx.db.patch(global._id, { revision: global.revision + 1 });
  else await ctx.db.insert('institutionSettings', { key: 'catalogue', revision: 2 });
  return revision;
}

export async function catalogue(ctx: Context, year?: number) {
  const rows =
    year === undefined
      ? await ctx.db.query('institutionalEvents').take(1000)
      : await ctx.db
          .query('institutionalEvents')
          .withIndex('by_year', (q) => q.eq('year', year))
          .take(1000);
  if (rows.length === 1000) fail('Consulte a base institucional por ano.');
  return {
    revision: year === undefined ? await globalRevision(ctx) : await yearRevision(ctx, year),
    events: rows.map(
      ({ code, name, start, end, kind, category, evidence, modalities, active }) => ({
        id: code,
        name,
        start,
        end,
        kind,
        category,
        evidence,
        modalities,
        active,
      }),
    ),
  };
}
