import { expect, expectTypeOf, test } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import type { CalendarEvent, InstitutionalEventSnapshot } from '../../src/domain/calendar/model.ts';

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
  expectTypeOf<InstitutionalEventSnapshot>().toExtend<CalendarEvent>();
});
