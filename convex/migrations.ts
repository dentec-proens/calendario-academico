import { Migrations } from '@convex-dev/migrations';
import type { MigrationFunctionReference } from '@convex-dev/migrations';
import { getFunctionName } from 'convex/server';
import { v } from 'convex/values';
import { isEditable, type CalendarStatus } from '../src/domain/calendar/lifecycle.ts';
import {
  mergePedagogicalMeetings,
  mergesPedagogicalMeetings,
} from '../src/domain/calendar/normalization/pedagogical-meetings.ts';
import { policyFor } from '../src/domain/policies/registry.ts';
import { components, internal } from './_generated/api';
import { internalMutation, internalQuery } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { transitionAudit } from './calendars/transitions';
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

/** The audited actions that put a calendar in each status, including the trash for drafts. */
const statusEntryActions: Record<CalendarStatus, readonly string[]> = {
  rascunho: [transitionAudit.withdraw, 'DELETE_CALENDAR', 'RESTORE_CALENDAR'],
  enviado: [transitionAudit.submit],
  em_revisao: [transitionAudit.startReview, transitionAudit.reopen],
  revisado: [transitionAudit.conclude],
  devolvido: [transitionAudit.return, transitionAudit.withdraw],
  vigente: [transitionAudit.publish, transitionAudit.reinstate],
  arquivado: [transitionAudit.archive],
};

/**
 * When a calendar saved before `statusAt` entered its current status. Every transition
 * leaves the status it entered, so the latest audit of an action leading to the current status is
 * that entry. Without one, the row's own dates stand in: archiving, publication, the current
 * submission and, for a draft, its creation. A draft deleted or restored as a draft counts from
 * that moment, which the queue never shows.
 */
export function statusEntryTime(
  row: Pick<Doc<'calendars'>, 'status' | '_creationTime' | 'publishedAt' | 'archivedAt'>,
  evidence: { audited: (number | undefined)[]; submittedAt: number | undefined },
) {
  const audited = evidence.audited.filter((at) => at !== undefined);
  if (audited.length) return Math.max(...audited);
  if (row.status === 'arquivado' && row.archivedAt !== undefined) return row.archivedAt;
  if (row.status === 'vigente' && row.publishedAt !== undefined) return row.publishedAt;
  if (row.status !== 'rascunho' && evidence.submittedAt !== undefined) return evidence.submittedAt;
  return row._creationTime;
}

/**
 * Level 1: the review queue orders each status by `statusAt`, which every status change
 * writes from this release on. Rows already filled, including those changed while this runs, keep
 * their value. Leaves `pending` once concluded in production, with the field made required.
 */
export const fillStatusAt = migrations.define({
  table: 'calendars',
  migrateOne: async (ctx, row) => {
    if (row.statusAt !== undefined) return;
    const [audited, submission] = await Promise.all([
      Promise.all(
        statusEntryActions[row.status].map(async (action) => {
          const latest = await ctx.db
            .query('audit')
            .withIndex('by_calendarId_and_action_and_at', (q) =>
              q.eq('calendarId', row._id).eq('action', action),
            )
            .order('desc')
            .first();
          return latest?.at;
        }),
      ),
      row.currentSubmissionId ? ctx.db.get('calendarSubmissions', row.currentSubmissionId) : null,
    ]);
    return {
      statusAt: statusEntryTime(row, { audited, submittedAt: submission?.submittedAt }),
    };
  },
});

const pending: MigrationFunctionReference[] = [
  internal.migrations.mergePedagogicalMeetingLinks,
  internal.migrations.fillStatusAt,
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
