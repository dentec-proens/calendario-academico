import { vi } from 'vitest';
import { internal } from '../../convex/_generated/api.js';
import type { Doc } from '../../convex/_generated/dataModel.js';
import { contentHash } from '../../convex/calendars/lifecycle.ts';
import {
  convertCatalogueEventV5,
  convertContentV5,
  provenScopeIds,
} from '../../src/domain/calendar/migration/convert-v5.ts';
import type { createNativeFixture } from './native-database.ts';
import { bindIds } from './v4-storage.ts';
import { v4CatalogueRows, v4Cases, type V4Case } from './v4-fixtures.ts';

/**
 * The v4 documents of `test/fixtures/v4/` stored in `convex-test` as a deployment holds them
 * before the v5 migration (phase 2, steps 17b and 18 of
 * `docs/plans/2026-11-02-atividades-e-datas.md`), and the migration run to its end. Tests using
 * `runMigrations` fake `setTimeout` (`vi.useFakeTimers({ toFake: ['setTimeout'] })`).
 */
export type Fixture = Awaited<ReturnType<typeof createNativeFixture>>;
type Json = Record<string, unknown>;
export type MigratedTable = 'institutionalEvents' | 'calendarContents' | 'calendarSubmissions';
type CalendarFields = Partial<Omit<Doc<'calendars'>, '_id' | '_creationTime'>>;

export const migrationNames = [
  'migrations:catalogueToV5',
  'migrations:contentsToV5',
  'migrations:submissionsToV5',
];

export async function runMigrations(fixture: Fixture) {
  await fixture.client.mutation(internal.migrations.start, {});
  await fixture.client.finishAllScheduledFunctions(vi.runAllTimers);
  return fixture.client.query(internal.migrations.status, {});
}

export const withoutSystem = ({ _id, _creationTime, ...fields }: Json) => fields;

const offerKinds = (item: V4Case) =>
  [
    ...new Set(item.content.state.offers.map((offer) => offer.kind)),
  ] as Doc<'calendars'>['offerKinds'];

/**
 * Stores every frozen v4 document as a deployment before the migration has it, each calendar in
 * its own year (with the fields `calendar` adds), with the fingerprint each submission had when it
 * was sent (computed over the bound IDs). Returns what each document must become: the converter's
 * result over the stored document, with the submission's proven lists read from the content
 * manifest, and the case it came from. Without `catalogue`, the frozen catalogue rows are left out,
 * so the current base of a calendar not yet published is empty.
 */
export async function storeV4(
  fixture: Fixture,
  cases = v4Cases(),
  calendar: (item: V4Case) => CalendarFields = () => ({}),
  { catalogue = true }: { catalogue?: boolean } = {},
) {
  return fixture.client.run(async (ctx) => {
    const bind = await bindIds(ctx, fixture.ids.campuses.a, fixture.ids.users.admin);
    const expected: { table: MigratedTable; id: string; value: Json; item?: V4Case }[] = [];
    for (const item of cases) {
      const fields = {
        year: item.year,
        offerKinds: offerKinds(item),
        version: 7,
        updatedAt: 9,
        ...calendar(item),
      };
      const content = await bind(item.content, fields);
      const submissions = [];
      for (const submission of item.submissions) {
        const copy = await bind(submission, fields);
        submissions.push({ ...copy, contentHash: contentHash(copy as never) });
      }
      const conversion = convertContentV5(content, { year: item.year, submissions })!;
      expected.push({
        table: 'calendarContents',
        id: await ctx.db.insert('calendarContents', content as never),
        value: conversion.document,
        item,
      });
      for (const copy of submissions) {
        const converted = convertContentV5(copy, {
          year: item.year,
          source: 'submission',
          provenScopes: provenScopeIds(conversion.manifest, copy.sequence),
        })!.document;
        expected.push({
          table: 'calendarSubmissions',
          id: await ctx.db.insert('calendarSubmissions', copy as never),
          value: { ...converted, contentHash: contentHash(converted as never) },
          item,
        });
      }
    }
    for (const row of catalogue ? v4CatalogueRows() : [])
      expected.push({
        table: 'institutionalEvents',
        id: await ctx.db.insert('institutionalEvents', row as never),
        value: convertCatalogueEventV5(row)!.document,
      });
    return expected;
  });
}

export const readAll = (fixture: Fixture) =>
  fixture.client.run(async (ctx) => ({
    calendars: await ctx.db.query('calendars').take(200),
    contents: await ctx.db.query('calendarContents').take(200),
    submissions: await ctx.db.query('calendarSubmissions').take(200),
    catalogue: await ctx.db.query('institutionalEvents').take(200),
    reviews: await ctx.db.query('reviews').take(200),
    reviewVersions: await ctx.db.query('reviewVersions').take(200),
    audit: await ctx.db.query('audit').take(200),
  }));
