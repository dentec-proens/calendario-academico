import { expect, test } from 'vitest';
import type { Id } from '../../convex/_generated/dataModel';
import type { MutationCtx } from '../../convex/_generated/server';
import { contentHash } from '../../convex/calendars/lifecycle.ts';
import { createNativeFixture } from '../helpers/native-database.ts';
import { v4CatalogueRows, v4Cases, type V4Case } from '../helpers/v4-fixtures.ts';
import {
  convertedCatalogueRow,
  convertedContent,
  convertedSubmission,
} from '../helpers/v5-conversion.ts';

/**
 * Phase 2, step 5: the schema already requires format 5. Every frozen v4 document, once
 * converted, is accepted by the storage validators; the stored v4 documents are refused.
 * Synthetic IDs of the fixtures are bound to real rows, as the stored documents had.
 */
type Json = Record<string, unknown>;

async function bindIds(ctx: MutationCtx, campusId: Id<'campuses'>, userId: Id<'users'>) {
  const calendars = new Map<string, Id<'calendars'>>();
  const documents = new Map<string, Id<'documents'>>();
  const storage = new Map<string, Id<'_storage'>>();
  const calendar = async (id: string) => {
    if (!calendars.has(id))
      calendars.set(
        id,
        await ctx.db.insert('calendars', {
          campusId,
          year: 2027,
          offerKinds: ['integrado'],
          status: 'rascunho',
          statusRevision: 0,
          courses: '',
          classes: '',
          shifts: '',
          version: 1,
          updatedAt: 0,
        }),
      );
    return calendars.get(id)!;
  };
  const file = async (id: string) => {
    if (!storage.has(id)) storage.set(id, await ctx.storage.store(new Blob([id])));
    return storage.get(id)!;
  };
  const document = async (item: Json) => {
    const id = String(item.id);
    if (!documents.has(id)) {
      const { id: _id, ...fields } = item;
      documents.set(
        id,
        await ctx.db.insert('documents', {
          ...(fields as Omit<Json, 'id'>),
          storageId: undefined,
          createdBy: undefined,
          publishedBy: undefined,
        } as never),
      );
    }
    return documents.get(id)!;
  };
  return async <T extends { calendarId: string; documentSnapshot: Json[] }>(value: T) => ({
    ...value,
    calendarId: await calendar(value.calendarId),
    documentSnapshot: await Promise.all(
      value.documentSnapshot.map(async (item) => ({
        ...item,
        id: await document(item),
        ...(typeof item.storageId === 'string' ? { storageId: await file(item.storageId) } : {}),
        ...(item.createdBy ? { createdBy: userId } : {}),
        ...(item.publishedBy ? { publishedBy: userId } : {}),
      })),
    ),
    ...('submittedBy' in value
      ? { submittedBy: { ...(value.submittedBy as Json), id: userId } }
      : {}),
  });
}

const insertAll = async (
  ctx: MutationCtx,
  bind: Awaited<ReturnType<typeof bindIds>>,
  item: V4Case,
  convert: boolean,
) => {
  const content = convert ? convertedContent(item) : item.content;
  await ctx.db.insert('calendarContents', (await bind(content)) as never);
  for (const submission of item.submissions)
    await ctx.db.insert(
      'calendarSubmissions',
      (await bind(convert ? convertedSubmission(item, submission) : submission)) as never,
    );
};

test('every converted document is accepted by the v5 schema', async () => {
  const { client, ids } = await createNativeFixture();
  const cases = v4Cases();
  const stored = await client.run(async (ctx) => {
    const bind = await bindIds(ctx, ids.campuses.a, ids.users.admin);
    for (const item of cases) await insertAll(ctx, bind, item, true);
    for (const row of v4CatalogueRows())
      await ctx.db.insert('institutionalEvents', convertedCatalogueRow(row) as never);
    return {
      contents: await ctx.db.query('calendarContents').take(100),
      submissions: await ctx.db.query('calendarSubmissions').take(100),
      catalogue: await ctx.db.query('institutionalEvents').take(100),
    };
  });
  expect(stored.contents).toHaveLength(cases.length);
  expect(stored.submissions).toHaveLength(cases.flatMap((item) => item.submissions).length);
  expect(stored.catalogue).toHaveLength(v4CatalogueRows().length);
  for (const content of stored.contents) {
    expect(content.state.schemaVersion).toBe(5);
    for (const event of [...content.state.events, ...content.institutionalSnapshot])
      expect(event).not.toHaveProperty('kind');
  }
  // The hash relation between a submission and the content holds over the stored documents.
  const hashes = stored.submissions.map(
    (submission) =>
      contentHash(submission) ===
      contentHash(stored.contents.find((content) => content.calendarId === submission.calendarId)!),
  );
  expect(hashes).toEqual([true, false, true]);
});

test('the stored v4 documents are refused by the v5 schema', async () => {
  const { client, ids } = await createNativeFixture();
  const [item] = v4Cases().filter((entry) => entry.submissions.length);
  await expect(
    client.run(async (ctx) => {
      const bind = await bindIds(ctx, ids.campuses.a, ids.users.admin);
      await ctx.db.insert('calendarContents', (await bind(item.content)) as never);
    }),
  ).rejects.toThrow('Expected `5`, got `4`');
  await expect(
    client.run(async (ctx) => {
      const bind = await bindIds(ctx, ids.campuses.a, ids.users.admin);
      await insertAll(ctx, bind, { ...item, content: convertedContent(item) }, false);
    }),
  ).rejects.toThrow('Expected `5`, got `4`');
  const [row] = v4CatalogueRows();
  await expect(
    client.run((ctx) => ctx.db.insert('institutionalEvents', row as never)),
  ).rejects.toThrow(/Missing required field `effect`/);
});
