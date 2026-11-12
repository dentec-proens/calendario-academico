import { expect, test } from 'vitest';
import { api } from '../../convex/_generated/api.js';
import type { Id } from '../../convex/_generated/dataModel.js';
import type { MutationCtx } from '../../convex/_generated/server.js';
import { createNativeFixture } from '../helpers/native-database.ts';
import {
  storedCases,
  storedCatalogueRows,
  type StoredCase,
  type StoredSubmission,
} from '../helpers/stored-fixtures.ts';

/**
 * A document of format 4 is refused by the storage validators, and clients built for an earlier
 * format are refused by `saveCalendar` and `saveReview`.
 */
async function calendar() {
  const fixture = await createNativeFixture();
  const campus = fixture.asClient('campus-a');
  const record = await campus.mutation(api.calendars.createCalendar, {
    body: {
      campusId: fixture.ids.campuses.a,
      year: 2027,
      offers: [{ kind: 'integrado', organization: 'anual' }],
    },
  });
  const contentId = await fixture.client.run(
    async (ctx) =>
      (await ctx.db
        .query('calendarContents')
        .withIndex('by_calendarId', (q) => q.eq('calendarId', record.id as Id<'calendars'>))
        .unique())!._id,
  );
  return { fixture, campus, record, contentId };
}

/**
 * The stored documents use synthetic names where the schema holds native IDs (users, documents,
 * files, the calendar). Those references become rows of the test database; everything else is the
 * stored value, unchanged.
 */
async function nativeReferences(
  ctx: MutationCtx,
  calendarId: Id<'calendars'>,
  userId: Id<'users'>,
  item: StoredCase,
) {
  const documentSnapshot = async (rows: Record<string, unknown>[]) => {
    const result = [];
    for (const { id: _id, storageId, createdBy, publishedBy, ...row } of rows) {
      const id = await ctx.db.insert('documents', {
        year: row.year,
        type: row.type,
        title: row.title,
        source: row.source,
        hash: row.hash,
        filename: row.filename,
        status: row.status,
        version: row.version,
        createdAt: row.createdAt,
      } as never);
      result.push({
        ...row,
        id,
        ...(storageId ? { storageId: await ctx.storage.store(new Blob(['pdf'])) } : {}),
        ...(createdBy ? { createdBy: userId } : {}),
        ...(publishedBy ? { publishedBy: userId } : {}),
      });
    }
    return result;
  };
  const submission = async ({ calendarId: _calendar, ...stored }: StoredSubmission) => ({
    ...stored,
    calendarId,
    submittedBy: { ...(stored.submittedBy as object), id: userId },
    documentSnapshot: await documentSnapshot(stored.documentSnapshot),
  });
  return {
    documentSnapshot: await documentSnapshot(item.content.documentSnapshot),
    submissions: await Promise.all(item.submissions.map(submission)),
  };
}

test('the stored fixtures are accepted by the schema', async () => {
  const { fixture, record, contentId } = await calendar();
  const calendarId = record.id as Id<'calendars'>;
  const userId = fixture.ids.users.admin!;
  const submissions = await fixture.client.run(async (ctx) => {
    let count = 0;
    for (const item of storedCases()) {
      const native = await nativeReferences(ctx, calendarId, userId, item);
      await ctx.db.patch(contentId, {
        state: item.content.state as never,
        catalogueRevision: item.content.catalogueRevision,
        institutionalSnapshot: item.content.institutionalSnapshot as never,
        documentSnapshot: native.documentSnapshot as never,
      });
      for (const submission of native.submissions) {
        await ctx.db.insert('calendarSubmissions', submission as never);
        count += 1;
      }
    }
    for (const row of storedCatalogueRows())
      await ctx.db.insert('institutionalEvents', row as never);
    return count;
  });
  expect(submissions).toBe(storedCases().flatMap((item) => item.submissions).length);
  expect(submissions).toBeGreaterThan(0);
});
