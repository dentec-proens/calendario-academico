import { expect, test } from 'vitest';
import { cycleLink, onceLink } from '../helpers/activity-links.ts';
import { evaluatePlan } from '../../src/domain/calendar/activities/plan-evaluation.ts';
import {
  activityStep,
  dateOrigin,
} from '../../web/features/calendar-editor/events/activity-step.ts';
import { applicationSearch } from '../../web/app/search.ts';
import { activityKey } from '../../src/domain/calendar/activities/activity-ref.ts';
import { cascavelDraft, ivaiporaDraft } from '../fixtures/pending-links-2027.ts';
import type { CalendarState } from '../../web/features/calendar-editor/types.ts';

const step = (
  fixture: typeof ivaiporaDraft,
  search: Record<string, string> = {},
  pinned?: string,
) => {
  const state = fixture() as unknown as CalendarState;
  return activityStep({
    state,
    events: state.events,
    institutional: [],
    evaluation: evaluatePlan(state),
    search: applicationSearch(search),
    pinned,
  });
};

test.each([
  [ivaiporaDraft, 11],
  [cascavelDraft, 10],
])('links without generated activity are reviewed, never campus dates', (fixture, count) => {
  const result = step(fixture);
  expect(result.review).toHaveLength(count);
  expect(result.campus.every((line) => !line.event.activity)).toBe(true);
  expect(result.dates).toHaveLength(fixture().events.length);
});

test('origin is computed from container and link', () => {
  expect(dateOrigin({ institutional: true, activity: onceLink('family-meeting') })).toBe('base');
  expect(dateOrigin({ activity: cycleLink('final', 'first') })).toBe('linked');
  expect(dateOrigin({})).toBe('campus');
});

test('counters follow the unit of each view and every filter but pendency', () => {
  const byActivity = step(ivaiporaDraft);
  expect(byActivity.counts['']).toBe(
    byActivity.activities.length + byActivity.review.length + byActivity.campus.length,
  );
  expect(byActivity.counts.preencher + byActivity.counts['sem-pendencias']).toBe(
    byActivity.counts[''],
  );
  const byDate = step(ivaiporaDraft, { atividadeVisao: 'data', atividadeOrigem: 'campus' });
  expect(byDate.counts['']).toBe(5);
  expect(byDate.dates.every((line) => line.origin === 'campus')).toBe(true);
  const toFill = step(ivaiporaDraft, { atividadePendencia: 'preencher' });
  expect(toFill.campus).toHaveLength(0);
  expect(toFill.review).toHaveLength(11);
  // Former values of the view are not aliases of the pendency filter.
  expect(applicationSearch({ atividadeVisao: 'preencher' })).toEqual({});
});

test('activities are addressed by the key of their link, which pins them past the filters', () => {
  const all = step(ivaiporaDraft);
  for (const line of all.activities) expect(line.key).toBe(activityKey(line.item.activity));
  expect(all.activities.map((line) => line.key)).toContain('pit:semester:first');
  // The campus origin hides activities, except the one a review link or the panel pins.
  const filters = { atividadeOrigem: 'campus', atividadePendencia: 'sem-pendencias' };
  expect(step(ivaiporaDraft, filters).activities).toHaveLength(0);
  expect(
    step(ivaiporaDraft, filters, 'pit:semester:first').activities.map((line) => line.key),
  ).toEqual(['pit:semester:first']);
  // A format 4 identifier pins nothing.
  expect(step(ivaiporaDraft, filters, 'pit-1').activities).toHaveLength(0);
});
