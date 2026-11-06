import { describe, expect, test } from 'vitest';
import { groupPendencies, pendingActivityCount } from '../../src/domain/calendar/pendencies.ts';
import { contentAssessment, contentIssues } from '../../src/domain/calendar/readiness.ts';
import { isAssessmentStage } from '../../src/domain/calendar/activities/activity-ref.ts';
import { onceLink } from '../helpers/activity-links.ts';
import { civilDate } from '../../src/domain/civil-date.ts';
import { calendarOffersFixture } from '../fixtures/calendar-offers.ts';
import { cascavelDraft, ivaiporaDraft } from '../fixtures/pending-links-2027.ts';
import { normalizeOfferCalendar } from '../../src/domain/calendar/normalization/normalize.ts';
import {
  activityStepFor,
  inListOrder,
  nextPendingActivity,
} from '../../web/features/calendar-editor/events/activity-step.ts';
import { stepIssueCounts } from '../../web/features/calendar-editor/editor-steps.ts';
import { applicationSearch } from '../../web/app/search.ts';
import type { ActivityState, CalendarOffer } from '../../src/domain/calendar/model.ts';
import type { CalendarState } from '../../web/features/calendar-editor/types.ts';

const offer = (
  id: string,
  kind: CalendarOffer['kind'],
  organization: CalendarOffer['organization'],
  perTerm: number,
): CalendarOffer => ({
  id,
  kind,
  delivery: 'presencial',
  organization,
  stages: { status: 'defined', perTerm },
});

/** A new calendar, with nothing filled, for the offers given. */
const blank = (offers: CalendarOffer[]) =>
  ({
    schemaVersion: 6,
    campus: 'Campus de teste',
    year: 2027,
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [],
    events: [],
    offers,
  }) as unknown as CalendarState;
const annual = offer('integrado', 'integrado', 'anual', 4);
const semestral = offer('graduacao', 'graduacao', 'semestral', 1);
const mixed = () => blank([annual, semestral]);
const offersFixture = () => normalizeOfferCalendar(calendarOffersFixture()) as CalendarState;

const pendenciesOf = (state: ActivityState) => groupPendencies(contentIssues(state, []), state);
const step = (state: CalendarState, search: Record<string, string> = {}, pinned?: string) =>
  activityStepFor({ state, baseEvents: [], search: applicationSearch(search), pinned });

const fixtures: [string, () => CalendarState][] = [
  ['a new calendar of one offer', () => blank([annual])],
  ['a new calendar of two offers', mixed],
  ['several undergraduate offers', offersFixture],
  ['Ivaiporã', () => ivaiporaDraft() as unknown as CalendarState],
  ['Cascavel', () => cascavelDraft() as unknown as CalendarState],
];

describe('one unit for the pendencies of the calendar', () => {
  test.each(fixtures)('%s: the step menu and the list show the same number', (_, fixture) => {
    const state = fixture();
    expect(stepIssueCounts(pendenciesOf(state)).events ?? 0).toBe(step(state).counts.preencher);
  });

  test.each(fixtures)('%s: grouping presents every diagnostic, unchanged', (_, fixture) => {
    const state = fixture();
    const issues = contentIssues(state, []);
    const grouped = pendenciesOf(state).flatMap((item) => item.issues);
    expect(grouped).toHaveLength(issues.length);
    expect(new Set(grouped)).toEqual(new Set(issues));
  });

  test('grouping does not change the diagnostics readiness and comparisons read', () => {
    const state = mixed();
    const before = structuredClone(contentAssessment({ state, institutionalSnapshot: [] }).issues);
    pendenciesOf(state);
    expect(contentAssessment({ state, institutionalSnapshot: [] }).issues).toEqual(before);
  });

  test('an activity missing from two offers is one item naming both', () => {
    const items = pendenciesOf(mixed());
    const meeting = items.filter((item) => item.key === 'activity:pit:semester:first');
    expect(meeting).toHaveLength(1);
    expect(meeting[0].offerIds).toEqual(['integrado', 'graduacao']);
    expect(meeting[0].details).toEqual([
      { text: 'Sem datas registradas.', offerIds: ['integrado', 'graduacao'] },
    ]);
    // Each diagnostic stays as readiness reads it, by offer.
    expect(meeting[0].issues.map((issue) => issue.offerId)).toEqual(['integrado', 'graduacao']);
    expect(new Set(meeting[0].issues.map((issue) => issue.code)).size).toBe(2);
    // The list has the same activity once, also counted once.
    const line = step(mixed()).activities.filter((row) => row.key === 'pit:semester:first');
    expect(line).toHaveLength(1);
    expect(line[0].pending).toBe(true);
    expect(line[0].offerIds).toEqual(['integrado', 'graduacao']);
  });

  test('a date that fulfils an activity counts as that activity, not as another item', () => {
    const state = mixed();
    state.events = [
      {
        id: 'meeting',
        name: 'Reunião com famílias',
        start: civilDate('2027-03-06'),
        end: civilDate('2027-03-06'),
        effect: 'include',
        category: 'evento',
        offers: ['integrado', 'graduacao'],
        activity: onceLink('family-meeting'),
      },
    ] as unknown as CalendarState['events'];
    const issues = contentIssues(state, []);
    const flagged = issues.filter((issue) => issue.target?.area === 'date');
    expect(flagged.map((issue) => issue.code)).toEqual(['school-day:meeting']);
    const items = groupPendencies(issues, state);
    expect(items.find((item) => item.issues.includes(flagged[0]))?.key).toBe(
      'activity:family-meeting',
    );
    expect(stepIssueCounts(items).events ?? 0).toBe(step(state).counts.preencher);
  });

  test('the assessment intervals count in the organization, where they are corrected', () => {
    const items = pendenciesOf(mixed());
    const stages = items.filter(
      (item) => item.target?.area === 'activity' && isAssessmentStage(item.target.activity),
    );
    expect(stages.length).toBeGreaterThan(0);
    expect(new Set(stages.map((item) => item.group))).toEqual(new Set(['structure']));
    // Only activities and dates remain for the Activities step, as its filter counts them.
    expect(items.filter((item) => item.group === 'activities').length).toBe(
      stepIssueCounts(items).events,
    );
  });

  test('applying an organization shows the real difference in activities to fill', () => {
    const one = pendingActivityCount(blank([annual]), []);
    const two = pendingActivityCount(mixed(), []);
    expect(one).toBeGreaterThan(0);
    expect(two).toBeGreaterThan(one);
    // The count is of activities, so a new assessment interval does not inflate it.
    expect(two).toBe(step(mixed()).activities.filter((line) => line.pending).length);
    // An organization with fewer stages generates fewer activities: the difference is the rule's.
    expect(
      pendingActivityCount(blank([{ ...annual, stages: { status: 'defined', perTerm: 2 } }]), []),
    ).toBeLessThan(one);
  });

  test('the by-date view counts dates and says how many activities have no line in it', () => {
    const empty = step(mixed(), { atividadeVisao: 'data' });
    expect(empty.counts.preencher).toBe(0);
    expect(empty.activitiesWithoutDates).toBe(step(mixed()).counts.preencher);
  });
});

describe('next pending activity', () => {
  const lines = (state: CalendarState, search: Record<string, string> = {}, pinned?: string) =>
    step(state, search, pinned).activities;

  test('follows the order of the list and goes on from the start for what was skipped', () => {
    const state = mixed();
    const pending = inListOrder(lines(state)).filter((line) => line.pending);
    const [first, second] = pending;
    expect(nextPendingActivity(lines(state), first.key)?.key).toBe(second.key);
    const last = pending.at(-1)!;
    expect(nextPendingActivity(lines(state), last.key)?.key).toBe(first.key);
  });

  test('walks the whole list once and then finds nothing else', () => {
    const state = mixed();
    const pending = inListOrder(lines(state)).filter((line) => line.pending);
    const visited = new Set<string>();
    let current = pending[0].key;
    for (let step = 0; step < pending.length; step++) {
      visited.add(current);
      current = nextPendingActivity(lines(state), current)?.key ?? current;
    }
    expect(visited.size).toBe(pending.length);
  });

  test('stays within the current filters', () => {
    const state = mixed();
    const search = { atividadeAssunto: 'teaching' };
    const filtered = inListOrder(lines(state, search)).filter((line) => line.pending);
    expect(filtered.every((line) => line.item.group === 'teaching')).toBe(true);
    const next = nextPendingActivity(lines(state, search, filtered[0].key), filtered[0].key);
    expect(next?.item.group).toBe('teaching');
    // A filter that leaves only the current activity has no other.
    const only = { atividadeBusca: filtered[0].item.name };
    expect(
      nextPendingActivity(lines(state, only, filtered[0].key), filtered[0].key),
    ).toBeUndefined();
    // Nothing pending is listed under “Sem pendências”.
    const clear = { atividadePendencia: 'sem-pendencias' };
    expect(
      nextPendingActivity(lines(state, clear, filtered[0].key), filtered[0].key),
    ).toBeUndefined();
  });
});
