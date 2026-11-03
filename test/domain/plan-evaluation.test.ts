import { describe, expect, test } from 'vitest';
import {
  activitySituation,
  classificationOf,
  classifyLinks,
  evaluatePlan,
  executionLabels,
  executionOf,
} from '../../src/domain/calendar/activities/plan-evaluation.ts';
import { linksToReview } from '../../src/domain/calendar/activities/links.ts';
import { reviewSupport } from '../../src/domain/reviews/technical-support.ts';
import { evaluateCalendar } from '../../src/domain/calendar/counting/evaluation.ts';
import { teachingDayBreakdown } from '../../src/printing/teaching-day-breakdown.ts';
import type { ActivityState } from '../../src/domain/calendar/model.ts';
import { cascavelDraft, conflictingLinks, ivaiporaDraft } from '../fixtures/pending-links-2027.ts';
import { storedCases } from '../helpers/stored-fixtures.ts';

/**
 * The evaluation is calculated by activity × offer, in separate dimensions, and none of them is
 * stored. The 21 audited dates of the Ivaiporã and Cascavel drafts are pending by offer and never
 * count as fulfilment.
 */

const audited = (): [string, ActivityState][] =>
  storedCases()
    .filter((item) => item.name.endsWith('(seção 11)'))
    .map((item) => {
      const content = item.content;
      return [
        item.name,
        { ...content.state, year: item.year, campus: item.campus } as unknown as ActivityState,
      ];
    });

const pendingDates = (state: ActivityState) =>
  [...linksToReview(state)].filter(([, issue]) => issue === 'unclassified').map(([id]) => id);

/** Every value of the rows a fulfilment could change, without the dates themselves. */
const situation = (state: ActivityState) =>
  evaluatePlan(state).rows.map((row) => ({
    id: row.requirement.id,
    offerId: row.offerId,
    classification: row.classification,
    applicability: row.applicability,
    coverage: row.coverage,
    execution: row.execution,
    humanReview: row.humanReview,
    issues: row.issues,
  }));

describe('the 21 audited dates (section 11)', () => {
  test('the frozen drafts hold the 21 dates, 11 and 10', () => {
    expect(audited().map(([, state]) => pendingDates(state).length)).toEqual([11, 10]);
  });

  test.each(audited())(
    '%s: every audited date is pending for each offer of its scope',
    (_, state) => {
      const ids = pendingDates(state);
      const { links } = evaluatePlan(state);
      for (const id of ids) {
        const event = state.events.find((item) => item.id === id)!;
        const entries = links.byOffer.filter((item) => item.eventId === id);
        expect(entries.map((item) => item.offerId)).toEqual(event.scope.offers);
        expect(entries.every((item) => item.classification === 'pending')).toBe(true);
        expect(entries.every((item) => item.issue === 'unclassified')).toBe(true);
        for (const offerId of event.scope.offers)
          expect(links.forOffer(id, offerId)).toBe('pending');
      }
      // Only these dates are pending: every other linked date has a generated activity.
      expect([
        ...new Set(
          links.byOffer.filter((i) => i.classification === 'pending').map((i) => i.eventId),
        ),
      ]).toEqual(ids);
    },
  );

  test.each(audited())('%s: the audited dates never count as fulfilment', (_, state) => {
    const ids = new Set(pendingDates(state));
    const { rows } = evaluatePlan(state);
    for (const row of rows) {
      expect(row.events.some((event) => ids.has(event.id))).toBe(false);
      expect(row.evidence.some((event) => ids.has(event.id))).toBe(false);
    }
    // Having dates, or having been converted, changes nothing in any dimension of any row.
    const without = { ...state, events: state.events.filter((event) => !ids.has(event.id)) };
    expect(situation(state)).toEqual(situation(without));
    // Nor the reviewer's signals and candidates: the link adds nothing to the textual matches
    // by name and category, which never prove fulfilment either.
    const review = (input: ActivityState) =>
      reviewSupport({ id: 'c', name: 'Calendário', version: 1, state: input }, input.events)
        .criteria;
    const unlinked = {
      ...state,
      events: state.events.map(({ activity, ...event }) =>
        ids.has(event.id) ? event : { ...event, activity },
      ),
    };
    expect(review(state)).toEqual(review(unlinked));
  });

  test.each([
    ['Ivaiporã', ivaiporaDraft, 11],
    ['Cascavel', cascavelDraft, 10],
  ] as const)('%s draft of the editor fixtures: pending by offer', (_, fixture, count) => {
    const state = fixture();
    const { links, rows } = evaluatePlan(state);
    const pending = links.byOffer.filter((item) => item.classification === 'pending');
    expect(new Set(pending.map((item) => item.eventId)).size).toBe(count);
    expect(pending).toHaveLength(
      state.events
        .filter((event) => event.activity)
        .reduce((sum, event) => sum + event.scope.offers.length, 0),
    );
    // Cascavel has two dates only for the undergraduate offer: pending for that offer only.
    if (fixture === cascavelDraft)
      expect(
        pending.filter((item) => item.eventId === 'cascavel-recognition-2').map((i) => i.offerId),
      ).toEqual(['graduacao']);
    expect(rows.every((row) => row.classification === 'compatible')).toBe(true);
    expect(rows.flatMap((row) => row.events)).toEqual([]);
  });
});

test('a link is pending for an offer its generated activity does not reach', () => {
  const state = cascavelDraft();
  // Only the integrated offer gets semester cycles: the 1st cycle `final` row exists for it alone.
  state.offers[0] = {
    ...state.offers[0]!,
    organization: 'semestral',
    stages: { status: 'defined', perTerm: 1 },
  };
  const { links, rows } = evaluatePlan(state);
  expect(links.issues.has('cascavel-final-1')).toBe(false);
  expect(links.forOffer('cascavel-final-1', 'integrado')).toBe('compatible');
  expect(links.forOffer('cascavel-final-1', 'graduacao')).toBe('pending');
  // A date pending for one offer never counts as fulfilment in that offer's row.
  const forGraduacao = rows.filter(
    (row) => row.offerId === 'graduacao' && row.events.some((e) => e.id === 'cascavel-final-1'),
  );
  expect(forGraduacao.length).toBeGreaterThan(0);
  for (const row of forGraduacao) {
    expect(row.coverage).not.toBe('complete');
    expect(row.classification).toBe('pending');
    expect(row.evidence.map((e) => e.id)).not.toContain('cascavel-final-1');
    expect(row.warnings.join(' ')).toContain('Classificação pendente');
  }
  // The integrated offer, which the generated activity reaches, still counts the same date.
  const forIntegrado = rows.find(
    (row) => row.offerId === 'integrado' && row.events.some((e) => e.id === 'cascavel-final-1'),
  )!;
  expect(forIntegrado.classification).toBe('compatible');
  expect(forIntegrado.evidence.map((e) => e.id)).toContain('cascavel-final-1');
  // The undergraduate-only date has no generated activity for its offer.
  expect(links.forOffer('cascavel-recognition-2', 'graduacao')).toBe('pending');
});

test('conflicting links diverge: kept apart from evidence, never complete by themselves', () => {
  const state = conflictingLinks();
  const { rows, links } = evaluatePlan(state);
  const duplicated = rows.find((row) => row.requirement.id === 'stage-2:integrado')!;
  expect(duplicated.classification).toBe('divergent');
  expect(duplicated.coverage).toBe('partial');
  expect(duplicated.evidence).toEqual([]);
  expect(links.forOffer('stage-twice-a', 'integrado')).toBe('divergent');
  const first = rows.find((row) => row.requirement.id === 'stage-1:integrado')!;
  expect(first.classification).toBe('compatible');
  expect(first.evidence.map((event) => event.id)).toEqual(first.events.map((event) => event.id));
  // Printing distributes only stages whose link is not under review.
  const result = evaluateCalendar(state, state.events);
  const report = teachingDayBreakdown(state, state.events, result, 'integrado');
  expect(report.stages[1]?.available).toBe(false);
});

test('the evaluation is calculated, never stored on the dates', () => {
  const state = ivaiporaDraft();
  const stored = JSON.stringify(state);
  const evaluation = evaluatePlan(state);
  classifyLinks(state);
  expect(JSON.stringify(state)).toBe(stored);
  const fields = new Set(state.events.flatMap((event) => Object.keys(event)));
  for (const dimension of ['classification', 'coverage', 'applicability', 'execution', 'evidence'])
    expect(fields.has(dimension)).toBe(false);
  expect(evaluation.rows.length).toBeGreaterThan(0);
});

test('each dimension has its own values', () => {
  expect(classificationOf(undefined)).toBe('compatible');
  expect(classificationOf('unclassified')).toBe('pending');
  for (const issue of ['duplicate-stage', 'stage-sequence', 'out-of-cycle'] as const)
    expect(classificationOf(issue)).toBe('divergent');
  expect(executionOf([])).toBe('unclassified');
  expect(executionOf([{ notice: { publication: 'published' } }])).toBe('published');
  expect(
    executionOf([{ notice: { publication: 'published' } }, { notice: { publication: 'planned' } }]),
  ).toBe('planned');
  expect(executionOf([{ notice: { publication: 'published' } }, {}])).toBe('unclassified');
  expect(executionLabels).toEqual({
    planned: 'Publicação programada',
    published: 'Publicação realizada',
  });
  // Execution is not planning: a published notice does not make the situation complete.
  expect(
    activitySituation([
      { applicability: 'required', coverage: 'partial', issues: [], warnings: [] },
    ]).status,
  ).toBe('partial');
});
