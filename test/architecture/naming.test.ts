import { expect, expectTypeOf, test } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import type {
  CalendarEvent,
  DateFields,
  InstitutionalEventSnapshot,
} from '../../src/domain/calendar/model.ts';

/**
 * Phase 2, step 2 of docs/plans/2026-11-02-atividades-e-datas.md: the vocabulary Atividade + Data
 * replaces the old code names without aliases or re-exports. A date is `CalendarEvent`, a
 * generated activity row is `ActivityPlanItem` from `activityPlan()`, and the counting core works
 * on `CountingInterval`. Step 3: an activity of a norm is an `ActivityRule` (`activities/rules.ts`).
 */
const repository = resolve(import.meta.dirname, '../..');
const self = relative(repository, import.meta.filename);

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
 * Step 9b: a date carries its link as `activity` (`ActivityRef`). The format 4 field survives only
 * where the plan keeps it: the converter and classifier, the frozen storage validators, the
 * constant historical key of the base identity and, in tests, the frozen oracles and the tests of
 * the conversion that read them.
 */
const requirementIdAllowed = new Set([
  'src/domain/calendar/migration/convert-v5.ts',
  'src/domain/calendar/migration/inventory.ts',
  'convex/legacyValidators.ts',
  'src/domain/calendar/base.ts',
  'test/domain/v5-inventory.test.ts',
  'test/domain/v5-conversion.test.ts',
  'test/domain/v5-activity-links.test.ts',
  'test/domain/activity-link-consumers.test.ts',
  // The frozen v3 oracle names each linked date by the row its link resolves to.
  'test/domain/offers-equivalence.test.ts',
  // Step 9d: the frozen dates linked to the retired “Classificação legada” rows of 2027.
  'test/helpers/legacy-classification.ts',
]);

test('requirementId remains only in the converter, frozen validators, oracles and base identity', async () => {
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
    if (path === self || requirementIdAllowed.has(path)) continue;
    if ((await readFile(file, 'utf8')).includes('requirementId')) found.push(path);
  }
  expect(found).toEqual([]);
  const base = await readFile(resolve(repository, 'src/domain/calendar/base.ts'), 'utf8');
  expect(base.match(/requirementId.*/g)).toEqual(["requirementId: '',"]);
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
  // Snapshots keep their scope by offer type; only local dates have `scope` (plan, 5.3).
  expectTypeOf<InstitutionalEventSnapshot>().toExtend<DateFields>();
  expectTypeOf<InstitutionalEventSnapshot>().not.toHaveProperty('scope');
  expectTypeOf<CalendarEvent>().toHaveProperty('scope');
});
