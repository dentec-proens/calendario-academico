import { expect, expectTypeOf, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  CalendarEvent,
  DateFields,
  InstitutionalEventSnapshot,
} from '../../src/domain/calendar/model.ts';

/**
 * The vocabulary Atividade + Data (`docs/arquitetura-convex.md`) replaced the old code names
 * without aliases or re-exports. A date is `CalendarEvent`, a generated activity row is
 * `ActivityPlanItem` from `activityPlan()`, the counting core works on `CountingInterval`, and an
 * activity of a norm is an `ActivityRule` (`activities/rules.ts`).
 */
const repository = resolve(import.meta.dirname, '../..');

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
