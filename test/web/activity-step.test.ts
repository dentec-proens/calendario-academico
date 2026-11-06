import { expect, test } from 'vitest';
import { civilDate } from '../../src/domain/civil-date.ts';
import { cycleLink, onceLink } from '../helpers/activity-links.ts';
import { evaluatePlan } from '../../src/domain/calendar/activities/plan-evaluation.ts';
import {
  activityStep,
  dateOrigin,
} from '../../web/features/calendar-editor/events/activity-step.ts';
import { applicationSearch } from '../../web/app/search.ts';
import { activityKey } from '../../src/domain/calendar/activities/activity-ref.ts';
import { groupPendencies } from '../../src/domain/calendar/pendencies.ts';
import { contentIssues } from '../../src/domain/calendar/readiness.ts';
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
    pendencies: groupPendencies(contentIssues(state, []), state),
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
  expect(byDate.counts['']).toBe(6);
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

const internalDates = ['ivaipora-annual-final', 'ivaipora-annual-diary'];
const withInternalDates = () => {
  const state = ivaiporaDraft();
  state.events = state.events.map((event) =>
    internalDates.includes(event.id) ? { ...event, internal: true as const } : event,
  );
  return state;
};

test('visibility hides date lines only, never recomputing coverage, situation or pendency', () => {
  const all = step(withInternalDates);
  const official = step(withInternalDates, { atividadeVisibilidade: 'oficiais' });
  // Every activity stays, with the same situation and pendency, including the ones to fill.
  expect(official.activities).toEqual(all.activities);
  expect(official.activities.some((line) => line.pending && !line.dates.length)).toBe(true);
  expect(official.review).toEqual(all.review);
  expect(official.campus.map((line) => line.event.id)).toEqual(
    all.campus.map((line) => line.event.id).filter((id) => !internalDates.includes(id)),
  );
  expect(official.counts['']).toBe(all.counts[''] - internalDates.length);
  expect(official.counts.preencher).toBe(all.counts.preencher);
  expect(official.activitiesHidden).toBe(false);

  const internal = step(withInternalDates, { atividadeVisibilidade: 'internas' });
  expect(internal.activities).toHaveLength(0);
  expect(internal.activitiesHidden).toBe(true);
  expect(internal.review).toHaveLength(0);
  expect(internal.base).toHaveLength(0);
  expect(internal.campus.map((line) => line.event.id).sort()).toEqual([...internalDates].sort());
  expect(internal.counts).toEqual({ '': 2, preencher: 0, 'sem-pendencias': 2 });
  // By date: the same lines, counted in dates.
  const internalByDate = step(withInternalDates, {
    atividadeVisibilidade: 'internas',
    atividadeVisao: 'data',
  });
  expect(internalByDate.dates.map((line) => line.event.id).sort()).toEqual(
    [...internalDates].sort(),
  );
  expect(internalByDate.counts['']).toBe(2);
  const officialByDate = step(withInternalDates, {
    atividadeVisibilidade: 'oficiais',
    atividadeVisao: 'data',
  });
  expect(officialByDate.counts['']).toBe(withInternalDates().events.length - 2);
  // An activity pinned by the panel or a review link stays past the filter.
  expect(
    step(withInternalDates, { atividadeVisibilidade: 'internas' }, 'pit:semester:first').activities
      .length,
  ).toBe(1);
});

const weeks = [
  ['women-week', '2027-03-08', '2027-03-12'],
  ['ethics-week', '2027-05-03', '2027-05-07'],
] as const;
/** The draft with a date for each week whose review instruction only applies to a valid date. */
const withWeeks = (fixture: typeof ivaiporaDraft = ivaiporaDraft) => {
  const state = fixture();
  state.events = [
    ...state.events,
    ...weeks.map(([id, start, end]) => ({
      id,
      name: id,
      start: civilDate(start),
      end: civilDate(end),
      effect: 'note' as const,
      offers: ['integrado', 'subsequente'],
      activity: onceLink(id),
    })),
  ];
  return state;
};
const weekLines = (lines: ReturnType<typeof step>['activities']) =>
  lines.filter((line) => weeks.some(([id]) => line.key === activityKey(onceLink(id))));

test('a complete activity with only a review note has nothing left to fill', () => {
  const all = step(withWeeks);
  expect(weekLines(all.activities).map((line) => [line.status.status, line.pending])).toEqual([
    ['complete', false],
    ['complete', false],
  ]);
  expect(weekLines(step(withWeeks, { atividadePendencia: 'preencher' }).activities)).toEqual([]);
  expect(
    weekLines(step(withWeeks, { atividadePendencia: 'sem-pendencias' }).activities),
  ).toHaveLength(2);
  const byDate = step(withWeeks, { atividadeVisao: 'data' }).dates.filter((line) =>
    weeks.some(([id]) => line.event.id === id),
  );
  expect(byDate.map((line) => line.pending)).toEqual([false, false]);
});

test('only what the calendar counts is to fill; warnings keep their situation on the row', () => {
  // A link that does not reach an offer: complete by the required offer, a warning for the other.
  const unreached = () => {
    const state = cascavelDraft();
    state.offers[0] = {
      ...state.offers[0]!,
      organization: 'semestral',
      stages: { status: 'defined', perTerm: 1 },
    };
    return state;
  };
  expect(
    step(unreached).activities.some(
      (line) => line.status.status === 'complete' && line.status.problems,
    ),
  ).toBe(true);
  expect(
    step(unreached).activities.some((line) => line.status.status === 'complete' && line.pending),
  ).toBe(false);

  // An application still to confirm beside a complete required offer.
  const open = () => {
    const state = withWeeks();
    state.offers = [...state.offers, { ...state.offers[0], id: 'pos', kind: 'posgraduacao' }];
    return state;
  };
  expect(weekLines(step(open).activities)[0]).toMatchObject({
    status: { status: 'complete', toConfirm: 1 },
    pending: false,
  });

  // An invalid date on an optional offer.
  const optional = () => {
    const state = cascavelDraft();
    state.offers = state.offers.filter((offer) => offer.kind === 'graduacao');
    state.events = [
      {
        id: 'women-week',
        name: 'women-week',
        start: civilDate('2027-04-05'),
        end: civilDate('2027-04-09'),
        effect: 'note',
        offers: ['graduacao'],
        activity: onceLink('women-week'),
      },
    ];
    return state;
  };
  expect(weekLines(step(optional).activities)[0]).toMatchObject({
    status: { status: 'optional' },
    pending: true,
  });
});
