import { inspectBase } from './base';
import { releaseReadiness } from '../../src/domain/calendar/readiness';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import type { Member } from '../access/contracts';
import { catalogue } from '../catalogue/model';
import type * as contracts from '../contracts';
import { documentDto, currentDocuments } from '../documents/model';
import { assertCampus } from '../lib/authorization';
import type { Context } from '../lib/shared';
import { fail, iso, clean } from '../lib/shared';
import { reviewRow, reviewDto } from '../reviews/model';
import { calendarRow, contents, summary, domainState } from './model';
import type { Infer } from 'convex/values';

export async function baseRecord(ctx: Context, user: Member, id: Id<'calendars'>) {
  const row = await calendarRow(ctx, user, id),
    [content, campus, base, docs, review] = await Promise.all([
      contents(ctx, id),
      ctx.db.get(row.campusId),
      catalogue(ctx, row.year),
      currentDocuments(ctx, row.year),
      reviewRow(ctx, id),
    ]);
  if (!campus) fail('Campus não encontrado.', 404);
  const record = {
    ...(await summary(ctx, row, campus)),
    state: domainState(row, campus, content.state),
    catalogueRevision: content.catalogueRevision,
    documentSnapshot: content.documentSnapshot.map(documentDto),
    institutionalSnapshot: content.institutionalSnapshot,
  };
  const compatibility = inspectBase(record.state, content, base, docs);
  const readiness = releaseReadiness(record, {
    base: compatibility,
    catalogue: base,
    reviews: review ? [reviewDto(review)] : [],
  }) as Infer<typeof contracts.readiness>;
  return { row, content, record, base, docs, review, readiness, compatibility };
}

export async function fullRecord(
  ctx: Context,
  user: Member,
  id: Id<'calendars'>,
): Promise<Infer<typeof contracts.calendarDto>> {
  const { record, base, docs, readiness, compatibility } = await baseRecord(ctx, user, id);
  const versions = await ctx.db
    .query('calendarVersions')
    .withIndex('by_calendarId_and_version', (q) => q.eq('calendarId', id))
    .order('desc')
    .take(50);
  return clean({
    ...record,
    versions: versions.map((row) => ({
      version: row.version,
      at: iso(row.at),
      catalogueRevision: row.catalogueRevision,
    })),
    readiness,
    institutionalEvents: compatibility.snapshot.events,
    currentCatalogueRevision: base.revision,
    currentDocuments: docs.map(documentDto),
  });
}

export async function archive(
  ctx: MutationCtx,
  row: Doc<'calendars'>,
  content: Doc<'calendarContents'>,
) {
  const campus = await ctx.db.get(row.campusId);
  if (!campus) fail('Campus não encontrado.', 404);
  const snapshotId = await ctx.db.insert('calendarSnapshots', {
    state: domainState(row, campus, content.state),
    purpose: row.purpose,
    at: row.updatedAt,
    catalogueRevision: content.catalogueRevision,
    institutionalEvents: content.institutionalSnapshot,
    documentSnapshot: content.documentSnapshot,
  });
  await ctx.db.insert('calendarVersions', {
    calendarId: row._id,
    version: row.version,
    at: row.updatedAt,
    catalogueRevision: content.catalogueRevision,
    snapshotId,
  });
}

export async function calendarSummaries(ctx: Context, user: Member, deleted = false) {
  const rows = await calendarQuery(ctx, user, deleted).order('desc').take(100);
  return Promise.all(
    rows
      .filter((row) => !!row.deletedAt === deleted)
      .map(async (row) => {
        const campus = await ctx.db.get(row.campusId);
        if (!campus) fail('Campus não encontrado.', 404);
        return summary(ctx, row, campus);
      }),
  );
}

export function calendarQuery(
  ctx: Context,
  user: Member,
  deleted: boolean,
  requestedCampus?: Id<'campuses'>,
) {
  if (requestedCampus) assertCampus(user, requestedCampus);
  const campusId = user.role === 'CAMPUS' ? user.campusId! : requestedCampus;
  return campusId
    ? ctx.db.query('calendars').withIndex('by_campusId_and_deletedAt', (q) => {
        const scoped = q.eq('campusId', campusId);
        return deleted ? scoped.gt('deletedAt', 0) : scoped.eq('deletedAt', undefined);
      })
    : ctx.db
        .query('calendars')
        .withIndex('by_deletedAt', (q) =>
          deleted ? q.gt('deletedAt', 0) : q.eq('deletedAt', undefined),
        );
}
