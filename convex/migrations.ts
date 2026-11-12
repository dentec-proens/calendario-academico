import { Migrations } from '@convex-dev/migrations';
import type { MigrationFunctionReference } from '@convex-dev/migrations';
import { getFunctionName } from 'convex/server';
import { v } from 'convex/values';
import { isEditable } from '../src/domain/calendar/lifecycle.ts';
import {
  mergePedagogicalMeetings,
  mergesPedagogicalMeetings,
} from '../src/domain/calendar/normalization/pedagogical-meetings.ts';
import { policyFor } from '../src/domain/policies/registry.ts';
import { components, internal } from './_generated/api';
import { internalMutation, internalQuery } from './_generated/server';
import schema from './schema';

export const migrations = new Migrations(components.migrations, { schema, internalMutation });

/** CLI entry for one migration, including `dryRun` (docs/implantacao-convex-vercel.md, Comandos). */
export const run = migrations.runner();

/**
 * Level 1, `consup-292-2027-v11`: the pedagogical meeting of a stage is the same activity as its
 * council (`mergePedagogicalMeetings`). Only calendars in editing whose policy merged them change,
 * with no new version: a submission fixed its content by hash, and the review judges it as sent.
 * The stored `rulesetVersion` is not touched: it tells the campus which rule changes it has not
 * seen yet. Saving and a new version of a published calendar merge the same way, so a calendar
 * back in editing later needs no migration. Leaves `pending` once concluded in production.
 */
export const mergePedagogicalMeetingLinks = migrations.define({
  table: 'calendarContents',
  migrateOne: async (ctx, row) => {
    const events = mergePedagogicalMeetings(row.state.events);
    if (!events) return;
    const calendar = await ctx.db.get('calendars', row.calendarId);
    if (!calendar || !isEditable(calendar.status)) return;
    if (!mergesPedagogicalMeetings(policyFor(calendar.year))) return;
    return { state: { ...row.state, events } };
  },
});

const pending: MigrationFunctionReference[] = [internal.migrations.mergePedagogicalMeetingLinks];

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
