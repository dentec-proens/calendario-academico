import { describe, expect, test } from 'vitest';
import { civilDate } from '../../src/domain/civil-date.ts';
import {
  activityKey,
  activityRef,
  type ActivityRef,
} from '../../src/domain/calendar/activities/activity-ref.ts';
import { activityCoverage } from '../../src/domain/calendar/activities/coverage.ts';
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
import { convertedContent } from '../helpers/v5-conversion.ts';
import { readOracle, v4Cases } from '../helpers/v4-fixtures.ts';
import { cycleLink, semesterLink } from '../helpers/activity-links.ts';
import { legacyIds } from '../helpers/legacy-classification.ts';
import {
  cascavelDraft,
  ivaiporaDraft,
  stageLinksToReview,
} from '../fixtures/pending-links-2027.ts';

/**
 * Phase 2, step 9b of `docs/plans/2026-11-02-atividades-e-datas.md`: dates carry their link as
 * `activity` (`ActivityRef`) and every domain consumer reads it. A link is matched to the row the
 * configuration generates by its key, never by a composed identifier.
 */
type Json = Record<string, unknown>;

describe('links of the frozen v4 documents, converted', () => {
  const oracle = readOracle<{
    cases: {
      name: string;
      linksToReview: Record<string, string>;
      activities: { id: string; basis?: string }[];
    }[];
  }>();
  test.each(v4Cases().map((item) => [item.name, item] as const))(
    '%s: each link resolves to the row v4 matched by its identifier',
    (name, item) => {
      const content = convertedContent(item);
      const state = {
        ...content.state,
        year: item.year,
        campus: item.campus,
      } as unknown as ActivityState;
      const generated = generatedActivities(state);
      const recorded = oracle.cases.find((entry) => entry.name === name)!;
      const review = recorded.linksToReview;
      // Step 9d: rows v4 kept in 2027 as “Classificação legada” are no longer generated.
      const retired = legacyIds(recorded.activities);
      const pending = linksToReview(state);
      const stored = item.content.state.events as Json[];
      stored.forEach((event, index) => {
        const converted = state.events[index];
        expect(converted.id).toBe(event.id);
        expect(converted).not.toHaveProperty('requirementId');
        if (event.requirementId === undefined) {
          expect(converted.activity).toBeUndefined();
          return;
        }
        const row = generatedActivity(generated, converted.activity);
        // The row v4 generated with the same identifier, or none (a link to review).
        if (row) expect(row.id).toBe(event.requirementId);
        if (retired.has(String(event.requirementId))) {
          // No fallback to the operational catalogue: the kept link is a date to review.
          expect(row).toBeUndefined();
          expect(pending.get(String(event.id))).toBe('unclassified');
        } else if (review[String(event.id)] !== 'unclassified')
          expect(row?.id).toBe(event.requirementId);
      });
    },
  );
});

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
          scope: { offers, confirmed: true },
        })),
      );
      const state: ActivityState = {
        schemaVersion: 5,
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
      const coverage = activityCoverage(state);
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
      expect(linksToReview({ ...state, events: [cycle] }).get(cycle.id)).toBe('unclassified');
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
      expect(linksToReview(state).get(event.id)).toBe('unclassified');
      expect(generatedActivity(generatedActivities(state), event.activity)).toBeUndefined();
      // No coverage row lists it: its activity is not generated for the configuration.
      expect(
        activityCoverage(state).some((row) => row.events.some((item) => item.id === event.id)),
      ).toBe(false);
    }
    for (const state of drafts) {
      const readiness = releaseReadiness(
        { id: 'draft', version: 1, catalogueRevision: 1, institutionalSnapshot: [], state },
        { catalogue: { revision: 1 }, reviews: [] },
      );
      expect(
        readiness.warnings.filter((warning) => warning.startsWith('Vínculo a conferir')),
      ).toHaveLength(state.events.filter((event) => event.activity).length);
    }
  });

  test('results and councils by stage wait for review when the stage is not generated', () => {
    const state = stageLinksToReview();
    expect(Object.fromEntries(linksToReview(state))).toEqual({
      'results-unclassified': 'unclassified',
      'council-unclassified': 'unclassified',
      'results-beyond': 'unclassified',
      'council-beyond': 'unclassified',
    });
    const coverage = activityCoverage(state);
    const linkedRows = (id: string) =>
      coverage.filter((row) => row.events.some((event) => event.id === id));
    for (const id of [
      'results-unclassified',
      'council-unclassified',
      'results-beyond',
      'council-beyond',
    ])
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
