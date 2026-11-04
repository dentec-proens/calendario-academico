import { describe, expect, test } from 'vitest';
import { civilDate } from '../../src/domain/civil-date.ts';
import {
  activityKey,
  activityRef,
  type ActivityRef,
} from '../../src/domain/calendar/activities/activity-ref.ts';
import { evaluatePlan } from '../../src/domain/calendar/activities/plan-evaluation.ts';
import {
  generatedActivities,
  generatedActivity,
  linksToReview,
} from '../../src/domain/calendar/activities/links.ts';
import { activityPlan } from '../../src/domain/calendar/activities/plan.ts';
import type {
  ActivityState,
  CalendarEvent,
  CalendarOffer,
  CalendarPeriod,
} from '../../src/domain/calendar/model.ts';
import { releaseReadiness } from '../../src/domain/calendar/readiness.ts';
import { cycleLink, semesterLink } from '../helpers/activity-links.ts';
import {
  cascavelDraft,
  ivaiporaDraft,
  stageLinksToReview,
} from '../fixtures/pending-links-2027.ts';

/**
 * Dates carry their link as
 * `activity` (`ActivityRef`) and every domain consumer reads it. A link is matched to the row the
 * configuration generates by its key, never by a composed identifier.
 */

describe('PIT, RIT and teaching plan per reference semester (art. 11, XII)', () => {
  const annual = (id: string): CalendarOffer => ({
    id,
    kind: 'integrado',
    delivery: 'presencial',
    organization: 'anual',
    stages: { status: 'defined', perTerm: 4 },
  });
  const semester = (id: string): CalendarOffer => ({
    id,
    kind: 'graduacao',
    delivery: 'presencial',
    organization: 'semestral',
    stages: { status: 'defined', perTerm: 2 },
  });
  const period = (
    id: string,
    offers: string[],
    term: 'annual' | 'first' | 'second',
    start: string,
    end: string,
  ): CalendarPeriod => ({
    id,
    name: id,
    start: civilDate(start),
    end: civilDate(end),
    association: { status: 'defined', offers, term },
  });
  const configurations = {
    anual: {
      offers: [annual('integrado')],
      periods: [period('year', ['integrado'], 'annual', '2027-02-01', '2027-12-17')],
    },
    semestral: {
      offers: [semester('graduacao')],
      periods: [
        period('first', ['graduacao'], 'first', '2027-02-01', '2027-07-09'),
        period('second', ['graduacao'], 'second', '2027-07-26', '2027-12-17'),
      ],
    },
    mista: {
      offers: [annual('integrado'), semester('graduacao')],
      periods: [
        period('year', ['integrado'], 'annual', '2027-02-01', '2027-12-17'),
        period('first', ['graduacao'], 'first', '2027-02-01', '2027-07-09'),
        period('second', ['graduacao'], 'second', '2027-07-26', '2027-12-17'),
      ],
    },
  };
  const semesters = [
    ['first', '2027-03-01'],
    ['second', '2027-08-02'],
  ] as const;

  test.each(Object.entries(configurations))(
    'organização %s: one row per semester, linked by the reference semester',
    (_organization, configuration) => {
      const offers = configuration.offers.map((offer) => offer.id);
      const events: CalendarEvent[] = ['pit', 'rit', 'teaching-plan'].flatMap((activityId) =>
        semesters.map(([semester, date]) => ({
          id: `${activityId}-${semester}`,
          name: `${activityId} ${semester}`,
          start: civilDate(date),
          end: civilDate(date),
          effect: 'note' as const,
          category: 'prazo',
          activity: semesterLink(activityId, semester),
          offers,
        })),
      );
      const state: ActivityState = {
        schemaVersion: 6,
        rulesetVersion: 'consup-292-2027-v3',
        year: 2027,
        weekdays: [1, 2, 3, 4, 5],
        weekConfirmed: true,
        ...configuration,
        events,
      };
      // The legacy operational rows of 2027 (“Classificação legada”) leave in step 9d.
      const rows = activityPlan(state).filter(
        (row) =>
          ['pit', 'rit', 'teaching-plan'].includes(row.activity.activityId) &&
          row.basis !== 'Classificação legada',
      );
      // The same semester rows whatever the organization: a semester is not an offer cycle.
      expect(rows.map((row) => [row.id, activityKey(row.activity)])).toEqual(
        semesters.flatMap(([semester], index) =>
          ['pit', 'rit', 'teaching-plan'].map((id) => [
            `${id}-${index + 1}`,
            `${id}:semester:${semester}`,
          ]),
        ),
      );
      expect(linksToReview(state).size).toBe(0);
      const coverage = evaluatePlan(state).rows;
      for (const event of events) {
        const row = generatedActivity(generatedActivities(state), event.activity)!;
        expect(row.id).toBe(`${event.activity!.activityId}-${event.id.endsWith('first') ? 1 : 2}`);
        for (const offer of offers) {
          const line = coverage.find(
            (item) => item.requirement.id === row.id && item.offerId === offer,
          )!;
          expect(line.events.map((item) => item.id)).toEqual([event.id]);
          expect(line.warnings).toEqual([]);
        }
      }
      // A cycle-shaped link of the same activity is not the semester row: it waits for review.
      const cycle = {
        ...events[0],
        id: 'pit-as-cycle',
        activity: activityRef({ activityId: 'teaching-plan', term: 'first' }),
      };
      expect(linksToReview({ ...state, events: [cycle] }).get(cycle.id)).toBe('not-generated');
    },
  );
});

describe('dates under “Vínculo a conferir”', () => {
  test('the 21 audited dates keep their cycle link, wait for review and never count', () => {
    const drafts = [ivaiporaDraft(), cascavelDraft()];
    const linked = drafts.flatMap((state) =>
      state.events.filter((event) => event.activity).map((event) => ({ state, event })),
    );
    expect(linked).toHaveLength(21);
    for (const { state, event } of linked) {
      expect('term' in event.activity!).toBe(true);
      expect(activityRef(event.activity)).toEqual(event.activity);
      expect(linksToReview(state).get(event.id)).toBe('not-generated');
      expect(generatedActivity(generatedActivities(state), event.activity)).toBeUndefined();
      // No coverage row lists it: its activity is not generated for the configuration.
      expect(
        evaluatePlan(state).rows.some((row) => row.events.some((item) => item.id === event.id)),
      ).toBe(false);
    }
    for (const state of drafts) {
      const readiness = releaseReadiness(
        { id: 'draft', version: 1, catalogueRevision: 1, institutionalSnapshot: [], state },
        { catalogue: { revision: 1 }, reviews: [] },
      );
      expect(
        readiness.issues.filter((issue) => issue.startsWith('Vínculo a conferir')),
      ).toHaveLength(state.events.filter((event) => event.activity).length);
    }
  });

  test('results and councils by stage wait for review when the stage is not generated', () => {
    const state = stageLinksToReview();
    expect(Object.fromEntries(linksToReview(state))).toEqual({
      'results-uncounted': 'not-generated',
      'council-uncounted': 'not-generated',
      'results-beyond': 'not-generated',
      'council-beyond': 'not-generated',
    });
    const coverage = evaluatePlan(state).rows;
    const linkedRows = (id: string) =>
      coverage.filter((row) => row.events.some((event) => event.id === id));
    for (const id of ['results-uncounted', 'council-uncounted', 'results-beyond', 'council-beyond'])
      expect(linkedRows(id)).toEqual([]);
    for (const family of ['results', 'council']) {
      const [row] = linkedRows(`${family}-generated`);
      expect(row.requirement.id).toBe(`${family}-1:subsequente`);
      expect(activityKey(row.requirement.activity)).toBe(`${family}:stage:annual:1:subsequente`);
    }
  });

  test('a link is kept by key: the same activity in another cycle is another link', () => {
    const state = cascavelDraft();
    const [first] = state.events;
    const other: ActivityRef = cycleLink('final', 'second');
    expect(activityKey(first.activity!)).toBe('final:cycle:first');
    expect(activityKey(other)).not.toBe(activityKey(first.activity!));
  });
});
