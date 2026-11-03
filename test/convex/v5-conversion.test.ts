import { expect, test } from 'vitest';
import type { Id } from '../../convex/_generated/dataModel';
import type { MutationCtx } from '../../convex/_generated/server';
import { contentHash } from '../../convex/calendars/lifecycle.ts';
import { createNativeFixture } from '../helpers/native-database.ts';
import { bindIds } from '../helpers/v4-storage.ts';
import { v4CatalogueRows, v4Cases, type V4Case } from '../helpers/v4-fixtures.ts';
import {
  convertedCatalogueRow,
  convertedContent,
  convertedSubmission,
} from '../helpers/v5-conversion.ts';

/**
 * Phase 2, step 5: every frozen v4 document, once converted, is accepted by the v5 storage
 * validators. Step 17a widens the schema: the stored v4 documents are accepted again, unchanged,
 * so the migration can convert them, but never a document mixing both formats.
 * Synthetic IDs of the fixtures are bound to real rows, as the stored documents had.
 */
type Json = Record<string, unknown>;

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

test('the widened schema stores every frozen v4 document unchanged (step 17a)', async () => {
  const { client, ids } = await createNativeFixture();
  const cases = v4Cases();
  const stored = await client.run(async (ctx) => {
    const bind = await bindIds(ctx, ids.campuses.a, ids.users.admin);
    const expected: { table: string; id: string; value: Json }[] = [];
    for (const item of cases) {
      const content = await bind(item.content);
      expected.push({
        table: 'calendarContents',
        id: await ctx.db.insert('calendarContents', content as never),
        value: { ...content },
      });
      for (const submission of item.submissions) {
        const copy = await bind(submission);
        expected.push({
          table: 'calendarSubmissions',
          id: await ctx.db.insert('calendarSubmissions', copy as never),
          value: copy,
        });
      }
    }
    for (const row of v4CatalogueRows())
      expected.push({
        table: 'institutionalEvents',
        id: await ctx.db.insert('institutionalEvents', row as never),
        value: row,
      });
    return Promise.all(
      expected.map(async ({ table, id, value }) => {
        const {
          _id,
          _creationTime: _created,
          ...fields
        } = (await ctx.db.get(id as Id<'calendarContents'>))!;
        return { table, stored: fields, value };
      }),
    );
  });
  expect(stored).toHaveLength(
    cases.length + cases.flatMap((item) => item.submissions).length + v4CatalogueRows().length,
  );
  // Nothing is converted on the way in: the migration (step 17b) is the only converter.
  for (const { stored: fields, value } of stored) expect(fields).toEqual(value);
  expect(stored.filter(({ table }) => table === 'calendarContents')).toHaveLength(cases.length);
});

test('the widened schema refuses a document mixing the v4 and v5 formats', async () => {
  const { client, ids } = await createNativeFixture();
  const [item] = v4Cases().filter(
    (entry) => entry.submissions.length && entry.content.institutionalSnapshot.length,
  );
  const converted = convertedContent(item);
  const mixes = [
    { ...item.content, state: converted.state },
    { ...item.content, institutionalSnapshot: converted.institutionalSnapshot },
  ];
  for (const content of mixes)
    await expect(
      client.run(async (ctx) => {
        const bind = await bindIds(ctx, ids.campuses.a, ids.users.admin);
        await ctx.db.insert('calendarContents', (await bind(content)) as never);
      }),
    ).rejects.toThrow(/does not match|Validator|validator/);
  const [submission] = item.submissions;
  const convertedCopy = convertedSubmission(item, submission);
  for (const copy of [
    { ...submission, state: convertedCopy.state },
    { ...submission, institutionalSnapshot: convertedCopy.institutionalSnapshot },
  ])
    await expect(
      client.run(async (ctx) => {
        const bind = await bindIds(ctx, ids.campuses.a, ids.users.admin);
        await ctx.db.insert('calendarSubmissions', (await bind(copy)) as never);
      }),
    ).rejects.toThrow(/does not match|Validator|validator/);
  const [row] = v4CatalogueRows();
  await expect(
    client.run((ctx) =>
      ctx.db.insert('institutionalEvents', { ...row, effect: row.kind } as never),
    ),
  ).rejects.toThrow(/does not match|Validator|validator/);
  expect(
    await client.run(async (ctx) => [
      ...(await ctx.db.query('calendarContents').take(10)),
      ...(await ctx.db.query('calendarSubmissions').take(10)),
      ...(await ctx.db.query('institutionalEvents').take(10)),
    ]),
  ).toEqual([]);
});
