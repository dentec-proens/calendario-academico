import { expect, expectTypeOf, test } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import type {
  CalendarEvent,
  CalendarOffer,
  DateFields,
  InstitutionalEventSnapshot,
} from '../../src/domain/calendar/model.ts';
import { retiredDateFields, retiredOfferFields } from '../helpers/retired-fields.ts';

/**
 * The vocabulary Atividade + Data (`docs/arquitetura-convex.md`) replaced the old code names
 * without aliases or re-exports. A date is `CalendarEvent`, a generated activity row is
 * `ActivityPlanItem` from `activityPlan()`, the counting core works on `CountingInterval`, and an
 * activity of a norm is an `ActivityRule` (`activities/rules.ts`).
 */
const repository = resolve(import.meta.dirname, '../..');
const self = relative(repository, import.meta.filename);

async function sourcesWithAnyExtension(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) =>
        entry.isDirectory()
          ? sourcesWithAnyExtension(join(directory, entry.name))
          : [join(directory, entry.name)],
      ),
    )
  )
    .flat()
    .filter((file) => !file.includes('/_generated/') && !file.includes('/__screenshots__/'));
}

async function sources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) =>
        entry.isDirectory() ? sources(join(directory, entry.name)) : [join(directory, entry.name)],
      ),
    )
  )
    .flat()
    .filter((file) => /\.tsx?$/.test(file) && !file.includes('/_generated/'));
}

const retired = [
  /\bCalendarActivity\w*/,
  /\bActivityRequirement\b/,
  /\bactivityChecklist\b/,
  /activities\/checklist\b/,
  /\bBaseEvent\b/,
  // Step 3: activity rules carry their repetition base, without sections.
  /\bRequirement(Spec|Section)\b/,
  /\b(expandRequirements|ExpandedRequirement|operationalSections)\b/,
  /activities\/requirement-table\b/,
];

test('old names of dates, activity rows and the activity plan are gone from the code', async () => {
  const files = (
    await Promise.all(
      ['src', 'web', 'convex', 'scripts', 'test'].map((folder) =>
        sources(resolve(repository, folder)),
      ),
    )
  ).flat();
  const found: string[] = [];
  for (const file of files) {
    const path = relative(repository, file);
    if (path === self) continue;
    const text = await readFile(file, 'utf8');
    for (const pattern of retired) {
      const match = text.match(pattern);
      if (match) found.push(`${path}: ${match[0]}`);
    }
  }
  expect(found).toEqual([]);
});

/**
 * After the contraction of the format 5 migration, the code uses
 * only format 5. The names of format 4 (the link `requirementId`, the effect `kind` of a date,
 * `recordType`, `legacyStageCount` and the `*V4` aliases) survive only in the constant historical
 * keys of the base identity and, in tests, in the lists of retired fields that the refusal tests
 * use and in the older oracles that recorded them.
 */
const formatFourNames: readonly RegExp[] = [
  /\brequirementIds?\b/,
  /\brecordType\b/,
  /\blegacyStageCount\b/,
  // The effect of a date written as format 4.
  /\bkind: ['"](include|exclude|note)['"]/,
  /\.kind === ['"](include|exclude|note)['"]/,
  // Aliases of format 4 (`eventV4`, `CalendarActivityV4`, `V4Case`).
  /\b[A-Za-z]\w*V4\b/,
  /\bV4[A-Z]\w*/,
];

const formatFourAllowed: readonly string[] = [
  // Constant historical keys of `eventContent` (base identity).
  'src/domain/calendar/base.ts',
  // The fields format 5 dropped, for the refusal tests.
  'test/helpers/retired-fields.ts',
  // The frozen v3 oracle names each linked date by the row its link resolves to.
  'test/domain/offers-equivalence.test.ts',
];

const allowed = (path: string) => formatFourAllowed.includes(path);

test('format 4 names remain only in the base identity, the retired fields and older oracles', async () => {
  const files = (
    await Promise.all(
      ['src', 'web', 'convex', 'scripts', 'test'].map((folder) =>
        sources(resolve(repository, folder)),
      ),
    )
  ).flat();
  const found: string[] = [];
  for (const file of files) {
    const path = relative(repository, file);
    if (path === self || allowed(path)) continue;
    const text = await readFile(file, 'utf8');
    for (const pattern of formatFourNames) {
      const match = text.match(pattern);
      if (match) found.push(`${path}: ${match[0]}`);
    }
  }
  expect(found).toEqual([]);
  const base = await readFile(resolve(repository, 'src/domain/calendar/base.ts'), 'utf8');
  expect(base.match(/requirementId.*/g)).toEqual(["requirementId: '',"]);
  expect(base.match(/\bkind: .*/g)).toEqual(['kind: event.effect,']);
});

test('modules and tests of format 5 carry no -v4 suffix', async () => {
  const files = (
    await Promise.all(
      ['src', 'web', 'convex', 'scripts', 'test'].map((folder) =>
        sourcesWithAnyExtension(resolve(repository, folder)),
      ),
    )
  ).flat();
  expect(
    files.map((file) => relative(repository, file)).filter((path) => /-v4\./.test(path)),
  ).toEqual([]);
});

test('dates and offers of format 5 have no field of format 4', () => {
  expectTypeOf<CalendarEvent>().not.toHaveProperty('requirementId');
  expectTypeOf<CalendarEvent>().not.toHaveProperty('kind');
  expectTypeOf<CalendarEvent>().not.toHaveProperty('recordType');
  expectTypeOf<CalendarEvent>().not.toHaveProperty('publicationStatus');
  expectTypeOf<CalendarEvent>().not.toHaveProperty('admission');
  expectTypeOf<InstitutionalEventSnapshot>().not.toHaveProperty('requirementId');
  expectTypeOf<InstitutionalEventSnapshot>().not.toHaveProperty('kind');
  expectTypeOf<InstitutionalEventSnapshot>().not.toHaveProperty('recordType');
  expectTypeOf<CalendarOffer>().not.toHaveProperty('legacyStageCount');
  expect(retiredDateFields).toEqual(
    expect.arrayContaining(['requirementId', 'kind', 'recordType']),
  );
  expect(retiredOfferFields).toEqual(['legacyStageCount']);
});

test('the counting core names its input intervals, not calendar events', async () => {
  const core = await readFile(resolve(repository, 'src/domain/calendar/counting/core.ts'), 'utf8');
  expect(core).not.toMatch(/\bCalendarEvent\b/);
  expect(core).toMatch(/export interface CountingInterval\b/);
});

test('the institutional projection is not part of a local date', () => {
  expectTypeOf<CalendarEvent>().not.toHaveProperty('originalStart');
  expectTypeOf<CalendarEvent>().not.toHaveProperty('originalEnd');
  expectTypeOf<CalendarEvent>().not.toHaveProperty('days');
  expectTypeOf<CalendarEvent>().not.toHaveProperty('institutional');
  expectTypeOf<InstitutionalEventSnapshot>().toHaveProperty('originalStart');
  expectTypeOf<InstitutionalEventSnapshot>().toHaveProperty('originalEnd');
  expectTypeOf<InstitutionalEventSnapshot>().toHaveProperty('institutional');
  // Both list the offers they reach; the snapshot has no offer types of its own.
  expectTypeOf<InstitutionalEventSnapshot>().toExtend<DateFields>();
  expectTypeOf<InstitutionalEventSnapshot>().not.toHaveProperty('modalities');
  expectTypeOf<InstitutionalEventSnapshot>().toHaveProperty('offers');
  expectTypeOf<CalendarEvent>().toHaveProperty('offers');
});
