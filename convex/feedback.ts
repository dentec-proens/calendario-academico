import { HOUR, RateLimiter } from '@convex-dev/rate-limiter';
import { paginationOptsValidator } from 'convex/server';
import { v, type Infer } from 'convex/values';
import { components, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import { requireAdmin, requireNativeUser } from './access/identity';
import { calendarRow } from './calendars/model';
import { maintenancePaused } from './lib/maintenance';
import { pageBound } from './lib/pagination';
import { fail } from './lib/shared';
import { calendarName } from '../src/domain/calendar/label.ts';
import {
  feedbackEditWindow,
  feedbackInterval,
  feedbackRetention,
  maximumFeedbackComment,
  validRating,
} from '../src/shared/feedback.ts';

/** The invitation only follows an action the person has just recorded. */
const actionWindow = 10 * 60_000;
const sweepBatch = 200;

const limiter = new RateLimiter(components.rateLimiter, {
  spontaneousFeedback: { kind: 'fixed window', rate: 10, period: HOUR },
});

const invitationContext = v.union(v.literal('submit'), v.literal('review'));
const feedbackContext = v.union(invitationContext, v.literal('spontaneous'));

/** The audit actions that show the person really did what the invitation asks about. */
const recordedActions: Record<Infer<typeof invitationContext>, string[]> = {
  submit: ['SUBMIT_CALENDAR'],
  review: ['CONCLUDE_REVIEW', 'RETURN_CALENDAR'],
};

const feedbackEntry = v.object({
  id: v.id('feedback'),
  at: v.number(),
  context: feedbackContext,
  rating: v.union(v.number(), v.null()),
  comment: v.union(v.string(), v.null()),
  route: v.string(),
  actor: v.string(),
  role: v.union(v.literal('ADMIN'), v.literal('CAMPUS'), v.literal('PARECERISTA')),
  calendar: v.union(v.string(), v.null()),
});

/** The route loses its query string and hash, which can carry private tokens. */
const cleanRoute = (route: string) => (route.split(/[?#]/)[0] ?? '').slice(0, 200);
const cleanRelease = (release: string) => release.slice(0, 64);

function cleanComment(comment: string) {
  const text = comment.trim();
  if (!text) fail('Escreva o comentário antes de enviar.', 400);
  if (text.length > maximumFeedbackComment)
    fail(`O comentário pode ter até ${maximumFeedbackComment} caracteres.`, 400);
  return text;
}

function checkRating(rating: number) {
  if (!validRating(rating)) fail('Escolha uma das cinco opções.', 400);
}

/** Only the author changes a record, and only shortly after the invitation. */
async function ownRecord(ctx: MutationCtx, userId: Id<'users'>, id: Id<'feedback'>) {
  const row = await ctx.db.get(id);
  if (!row || row.userId !== userId) fail('Registro não encontrado.', 404);
  if (Date.now() - row.at > feedbackEditWindow)
    fail('O prazo para alterar esta resposta terminou.', 409);
  return row;
}

async function recentlyActed(
  ctx: MutationCtx,
  userId: Id<'users'>,
  calendarId: Id<'calendars'>,
  context: Infer<typeof invitationContext>,
) {
  const since = Date.now() - actionWindow;
  for (const action of recordedActions[context]) {
    const rows = await ctx.db
      .query('audit')
      .withIndex('by_calendarId_and_action_and_at', (q) =>
        q.eq('calendarId', calendarId).eq('action', action).gte('at', since),
      )
      .take(20);
    if (rows.some((row) => row.actorId === userId)) return true;
  }
  return false;
}

/**
 * Opens an invitation after a lifecycle action, recording it as shown: ignoring or closing it
 * counts like answering, so the person is not asked again at the next action. Returns null when
 * there is nothing to ask, and drops silently during maintenance, since the invitation is optional.
 */
export const openFeedbackPrompt = mutation({
  args: {
    context: invitationContext,
    calendarId: v.id('calendars'),
    route: v.string(),
    release: v.string(),
  },
  returns: v.union(v.id('feedback'), v.null()),
  handler: async (ctx, { context, calendarId, route, release }) => {
    const { row: person, user } = await requireNativeUser(ctx);
    if (await maintenancePaused(ctx)) return null;
    await calendarRow(ctx, user, calendarId);
    if (!(await recentlyActed(ctx, person._id, calendarId, context))) return null;
    const asked = await ctx.db
      .query('feedback')
      .withIndex('by_userId_and_context_and_calendarId', (q) =>
        q.eq('userId', person._id).eq('context', context).eq('calendarId', calendarId),
      )
      .first();
    if (asked) return null;
    const at = Date.now();
    const recent = await ctx.db
      .query('feedback')
      .withIndex('by_userId_and_at', (q) =>
        q.eq('userId', person._id).gte('at', at - feedbackInterval),
      )
      .first();
    if (recent) return null;
    return ctx.db.insert('feedback', {
      at,
      userId: person._id,
      role: user.role,
      context,
      outcome: 'shown',
      route: cleanRoute(route),
      calendarId,
      release: cleanRelease(release),
    });
  },
});

/** Records or changes the rating of an invitation. */
export const rateFeedback = mutation({
  args: { id: v.id('feedback'), rating: v.number() },
  returns: v.null(),
  handler: async (ctx, { id, rating }) => {
    const { row: person } = await requireNativeUser(ctx);
    if (await maintenancePaused(ctx)) return null;
    checkRating(rating);
    await ownRecord(ctx, person._id, id);
    await ctx.db.patch(id, { rating, outcome: 'answered' });
    return null;
  },
});

/** Closing an invitation without rating it. */
export const dismissFeedback = mutation({
  args: { id: v.id('feedback') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { row: person } = await requireNativeUser(ctx);
    if (await maintenancePaused(ctx)) return null;
    const row = await ownRecord(ctx, person._id, id);
    if (row.outcome === 'shown') await ctx.db.patch(id, { outcome: 'dismissed' });
    return null;
  },
});

/** The optional comment that follows the rating. */
export const commentFeedback = mutation({
  args: { id: v.id('feedback'), comment: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, comment }) => {
    const { row: person } = await requireNativeUser(ctx);
    if (await maintenancePaused(ctx)) return null;
    const text = cleanComment(comment);
    await ownRecord(ctx, person._id, id);
    await ctx.db.patch(id, { comment: text, outcome: 'answered' });
    return null;
  },
});

/** A suggestion given on the person's own initiative: a rating, a comment, or both. */
export const sendFeedback = mutation({
  args: {
    rating: v.optional(v.number()),
    comment: v.optional(v.string()),
    route: v.string(),
    release: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { rating, comment, route, release }) => {
    const { row: person, user } = await requireNativeUser(ctx);
    if (await maintenancePaused(ctx)) return null;
    if (rating === undefined && !comment?.trim())
      fail('Escolha uma opção ou escreva um comentário.', 400);
    if (rating !== undefined) checkRating(rating);
    const text = comment?.trim() ? cleanComment(comment) : undefined;
    const { ok } = await limiter.limit(ctx, 'spontaneousFeedback', { key: person._id });
    if (!ok) return null;
    await ctx.db.insert('feedback', {
      at: Date.now(),
      userId: person._id,
      role: user.role,
      context: 'spontaneous',
      outcome: 'answered',
      ...(rating === undefined ? {} : { rating }),
      ...(text ? { comment: text } : {}),
      route: cleanRoute(route),
      release: cleanRelease(release),
    });
    return null;
  },
});

/** Answered feedback, latest first; invitations only shown or closed tell nothing to read. */
export const listFeedback = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    entries: v.array(feedbackEntry),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { paginationOpts }) => {
    pageBound(paginationOpts.numItems);
    await requireAdmin(ctx);
    const result = await ctx.db
      .query('feedback')
      .withIndex('by_outcome_and_at', (q) => q.eq('outcome', 'answered'))
      .order('desc')
      .paginate(paginationOpts);
    const entries = await Promise.all(result.page.map((row) => entry(ctx, row)));
    return { entries, isDone: result.isDone, continueCursor: result.continueCursor };
  },
});

async function entry(ctx: QueryCtx, row: Doc<'feedback'>): Promise<Infer<typeof feedbackEntry>> {
  const [author, record] = await Promise.all([
    ctx.db.get(row.userId),
    row.calendarId ? ctx.db.get(row.calendarId) : null,
  ]);
  const unit = record ? await ctx.db.get(record.campusId) : null;
  return {
    id: row._id,
    at: row.at,
    context: row.context,
    rating: row.rating ?? null,
    comment: row.comment ?? null,
    route: row.route,
    actor: author?.name ?? 'Conta removida',
    role: row.role,
    calendar: record && unit ? calendarName(record.year, unit.name, record.label) : null,
  };
}

export const sweep = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    if (await maintenancePaused(ctx)) return 0;
    const expired = await ctx.db
      .query('feedback')
      .withIndex('by_at', (q) => q.lt('at', Date.now() - feedbackRetention))
      .take(sweepBatch);
    for (const row of expired) await ctx.db.delete(row._id);
    if (expired.length === sweepBatch) await ctx.scheduler.runAfter(0, internal.feedback.sweep, {});
    return expired.length;
  },
});
