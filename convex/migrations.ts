import { Migrations } from '@convex-dev/migrations';
import type { MigrationFunctionReference } from '@convex-dev/migrations';
import { getFunctionName } from 'convex/server';
import { v } from 'convex/values';
import { components, internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalMutation, internalQuery } from './_generated/server';
import { contentHash } from './calendars/lifecycle';
import schema from './schema';

export const migrations = new Migrations(components.migrations, { schema, internalMutation });

/** CLI entry for one migration, including `dryRun` (docs/implantacao-convex-vercel.md, Comandos). */
export const run = migrations.runner();

const holdsTargetDays = (row: Doc<'calendarContents'> | Doc<'calendarSubmissions'>) =>
  row.state.periods.some((period) => period.targetDays !== undefined);

const withoutTargetDays = <S extends Doc<'calendarContents'>['state']>(state: S): S => ({
  ...state,
  periods: state.periods.map(({ targetDays: _retired, ...period }) => period),
});

/**
 * Level 1: no form ever wrote this value and only one draft period holds it. The stored `end`,
 * which is what the calendar shows and counts, stays. No new version: nothing a person sees changes.
 * If that draft was submitted meanwhile, its copy loses the value too, with its fingerprint, so
 * publication still compares content with content and the release never waits for a person.
 * The contraction removes these migrations with `targetDays` from the period validator.
 */
export const dropPeriodTargetDays = migrations.define({
  table: 'calendarContents',
  migrateOne: (_ctx, row) => {
    if (holdsTargetDays(row)) return { state: withoutTargetDays(row.state) };
  },
});

export const dropSubmissionTargetDays = migrations.define({
  table: 'calendarSubmissions',
  migrateOne: (_ctx, row) => {
    if (!holdsTargetDays(row)) return;
    if (contentHash(row) !== row.contentHash)
      throw new Error(`O hash gravado no envio ${row._id} não é o do próprio envio.`);
    const next = { ...row, state: withoutTargetDays(row.state) };
    return { state: next.state, contentHash: contentHash(next) };
  },
});

const pending: MigrationFunctionReference[] = [
  internal.migrations.dropPeriodTargetDays,
  internal.migrations.dropSubmissionTargetDays,
];

export const start = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await migrations.runSerially(ctx, pending);
    return null;
  },
});

export const status = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      name: v.string(),
      state: v.union(
        v.literal('inProgress'),
        v.literal('success'),
        v.literal('failed'),
        v.literal('canceled'),
        v.literal('unknown'),
      ),
      processed: v.number(),
      error: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    if (!pending.length) return [];
    const statuses = await migrations.getStatus(ctx, { migrations: pending });
    // In the order of `pending`, the order they run in.
    const order = pending.map((reference) => getFunctionName(reference));
    statuses.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
    return statuses.map(({ name, state, processed, error }) => ({
      name,
      state,
      processed,
      error: error ?? null,
    }));
  },
});
