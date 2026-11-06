import { expect, test } from 'vitest';
import { civilDate } from '../../src/domain/civil-date.ts';
import {
  announcedRuleChanges,
  equivalentRulesets,
  policyFor,
  rulesetChangesBetween,
} from '../../src/domain/policies/registry.ts';
import { assessmentCounts } from '../../src/domain/reviews/criteria.ts';
import { measuredCriteria } from '../../src/domain/reviews/evidence.ts';
import { reviewSupport } from '../../src/domain/reviews/technical-support.ts';
import { reviewDocument } from '../../src/printing/review-export.ts';
import { calendarOffersFixture } from '../fixtures/calendar-offers.ts';

const support = (state: ReturnType<typeof calendarOffersFixture>) =>
  reviewSupport({ id: 'synthetic', name: 'Calendário sintético', version: 1, state }, state.events);
const criterionOf = (result: ReturnType<typeof support>, id: string) =>
  result.criteria.find((criterion) => criterion.id === id)!;

test('every review policy declares the criteria the system measures', () => {
  for (const year of [2027, 2028]) {
    const ids = policyFor(year).review.criteria.map((criterion) => criterion.id);
    expect(ids).toEqual(expect.arrayContaining(Object.keys(measuredCriteria)));
  }
});

test('counts carry each offer, its minimum and its result, without repeating the offer', () => {
  const result = support(calendarOffersFixture());
  const annual = criterionOf(result, 'annual').evidence;
  expect(annual.kind).toBe('counts');
  if (annual.kind !== 'counts') return;
  expect(annual.rows.every((row) => row.minimum === 200 && row.met !== null)).toBe(true);
  const semester = criterionOf(result, 'semester').evidence;
  expect(semester.kind).toBe('counts');
  if (semester.kind !== 'counts') return;
  const semestral = semester.rows.filter((row) => row.period === '1º semestre');
  expect(semestral.length).toBeGreaterThan(0);
  expect(semestral.every((row) => !row.period!.includes(row.offer))).toBe(true);
  // An annual offer next to a semester one has no semester minimum, so its row has no result.
  expect(
    semester.rows.filter((row) => row.period === 'ano letivo').map((row) => row.minimum),
  ).toEqual(expect.arrayContaining([null]));
});

test('a semester offer without two semesters is a problem of the count', () => {
  const state = calendarOffersFixture();
  const secondOf2 = state.periods.findIndex(
    (period) =>
      period.association.status === 'defined' &&
      period.association.offers.includes('graduacao-2') &&
      period.association.term === 'second',
  );
  state.periods.splice(secondOf2, 1);
  const semester = criterionOf(support(state), 'semester');
  expect(semester.evidence).toMatchObject({
    kind: 'counts',
    issue: expect.stringContaining('Engenharia Elétrica') as string,
  });
  expect(semester.suggestion).toBe('NAO_ATENDIDO');
});

test('the school year is compared only when the scope allows it', () => {
  const state = calendarOffersFixture();
  expect(criterionOf(support(state), 'window').evidence).toMatchObject({
    kind: 'dates',
    state: 'compared',
    withinWindow: true,
  });
  state.periods[0].start = civilDate('2027-03-01');
  state.periods[0].end = civilDate('2027-12-31');
  const outside = criterionOf(support(state), 'window');
  expect(outside.evidence).toMatchObject({ withinWindow: false });
  expect(outside.suggestion).toBe('NAO_ATENDIDO');
});

test('an unconfirmed scope is said once and leaves no suggestion', () => {
  const state = calendarOffersFixture();
  delete state.offers[0].scope;
  const result = support(state);
  expect(result.scopeConfirmed).toBe(false);
  expect(result.criteria.every((criterion) => criterion.suggestion === null)).toBe(true);
  expect(criterionOf(result, 'window').evidence).toMatchObject({ kind: 'dates', state: 'scope' });
});

test('an unavailable count says why', () => {
  const state = calendarOffersFixture();
  state.weekdays = [];
  state.weekConfirmed = false;
  const evidence = criterionOf(support(state), 'annual').evidence;
  expect(evidence.kind).toBe('unavailable');
  if (evidence.kind === 'unavailable') expect(evidence.reason).not.toMatch(/^Contagem/);
});

test('a provisional count is marked and leaves no suggestion', () => {
  const state = calendarOffersFixture();
  state.weekConfirmed = false;
  const annual = criterionOf(support(state), 'annual');
  expect(annual.evidence).toMatchObject({ kind: 'counts', provisional: true });
  expect(annual.suggestion).toBeNull();
});

test('the minutes are checked in the process, and no holiday reads as one', () => {
  const state = calendarOffersFixture();
  const minutes = criterionOf(
    reviewSupport({ id: 's', name: 'S', version: 1, state }, [
      ...state.events,
      {
        id: 'christmas',
        name: 'Natal',
        start: civilDate('2027-12-25'),
        end: civilDate('2027-12-25'),
        category: 'feriado',
        offers: ['integrado'],
        evidence: '',
      },
    ]),
    'minutes',
  );
  expect(minutes.evidence).toEqual({ kind: 'documental' });
  expect(minutes.candidates).toEqual([]);
  expect(minutes.toCheck[0]).toContain('Art. 15');
});

test('what is not evaluated comes from the policy', () => {
  const { notEvaluated } = support(calendarOffersFixture());
  expect(notEvaluated.some((device) => device.startsWith('Art. 15'))).toBe(true);
});

const reviewOf = (entries: { id: string; status: string; reviewed: boolean }[]) => ({
  entries: entries.map((entry) => ({ ...entry, notes: '' })) as Parameters<
    typeof reviewDocument
  >[1]['entries'],
  reviewer: { name: 'Revisor' },
  revision: 1,
  catalogueRevision: 1,
  rulesetVersion: 'consup-292-2027-v8',
});

test('the export tells a human assessment from a suggestion saved before this interface', () => {
  const state = calendarOffersFixture();
  const { text } = reviewDocument(
    { state },
    reviewOf([
      { id: 'annual', status: 'ATENDIDO', reviewed: true },
      { id: 'semester', status: 'ATENDIDO', reviewed: false },
      { id: 'window', status: 'PENDENTE', reviewed: false },
    ]),
  );
  expect(text).toContain('Atendido — avaliação humana');
  expect(text).toContain('Atendido — proposta automática, não confirmada');
  expect(text).not.toContain('A avaliar — ');
  expect(text).toContain('Conjunto de regras: consup-292-2027-v8');
  expect(text).toContain('pelo menos 200 dias letivos');
  expect(text).not.toContain('Referência do modelo');
});

test('a review of the previous version keeps holding under the wording version', () => {
  expect(equivalentRulesets('consup-292-2027-v8', 'consup-292-2027-v9')).toBe(true);
  expect(
    announcedRuleChanges(
      {
        before: 'consup-292-2027-v8',
        changes: rulesetChangesBetween('consup-292-2027-v8', 'consup-292-2027-v9'),
      },
      '2026-11-05T00:00:00.000Z',
    ),
  ).toEqual([]);
});

test('a name match stays apart from the dates linked to the activity', () => {
  const state = calendarOffersFixture();
  const unlinked = {
    id: 'unlinked',
    name: 'Natal - conselho extraordinário de confraternização',
    start: civilDate('2027-12-20'),
    end: civilDate('2027-12-20'),
    category: 'evento',
    offers: ['integrado'],
    evidence: '',
  };
  const result = reviewSupport({ id: 's', name: 'S', version: 1, state }, [
    ...state.events,
    unlinked,
  ]);
  const council = criterionOf(result, 'XV');
  expect(council.evidence.kind).toBe('coverage');
  expect(council.candidates.map((record) => record.id)).toEqual(['unlinked']);
  expect(council.linkedRecords.map((record) => record.id)).not.toContain('unlinked');
  expect(criterionOf(result, 'I').linkedRecords.length).toBeGreaterThan(0);
});

test('a search reports what it found, and a year without a norm asserts nothing about its window', () => {
  const state = { ...calendarOffersFixture(), year: 2028 };
  const result = support(state);
  const holidays = criterionOf(result, 'XIX');
  expect(holidays.evidence).toEqual({ kind: 'search' });
  expect(holidays.linkedRecords).toEqual([]);
  expect(holidays.requirement).toBeNull();
  expect(holidays.source).toBe(holidays.item);
  expect(criterionOf(result, 'window').suggestion).toBeNull();
  expect(criterionOf(result, 'window').evidence).toMatchObject({ state: 'not-applied' });
});

test('periods read by offer, so rows of several offers do not collide', () => {
  const state = { ...calendarOffersFixture(), year: 2028 };
  const evidence = criterionOf(support(state), 'I').evidence;
  expect(evidence.kind).toBe('dates');
  if (evidence.kind !== 'dates') return;
  expect(evidence.state).toBe('listed');
  const labels = evidence.rows.map((row) => row.label);
  expect(new Set(labels).size).toBe(labels.length);
  const empty = criterionOf(support({ ...state, periods: [] }), 'I').evidence;
  expect(empty).toEqual({ kind: 'dates', state: 'empty', rows: [] });
});

test('a note applies by the offers of the calendar', () => {
  const state = { ...calendarOffersFixture(), year: 2028 };
  const note = /subsequentes e graduação/;
  expect(criterionOf(support(state), 'V').toCheck.join()).not.toMatch(note);
  const integrated = {
    ...state,
    offers: state.offers.filter((offer) => offer.kind === 'integrado'),
  };
  expect(criterionOf(support(integrated), 'V').toCheck.join()).toMatch(note);
});

test('execution applies only to an activity that publishes something', () => {
  const rows = (id: string) => {
    const evidence = criterionOf(support(calendarOffersFixture()), id).evidence;
    return evidence.kind === 'coverage' ? evidence.rows : [];
  };
  expect(rows('XIX').every((row) => row.execution === null)).toBe(true);
  expect(rows('admission-regular').every((row) => row.execution !== null)).toBe(true);
});

test('an offer outside the norm is not accused of missing semesters', () => {
  const state = calendarOffersFixture();
  state.offers[2].scope = { status: 'own-regulation' };
  const second = state.periods.findIndex(
    (period) =>
      period.association.status === 'defined' &&
      period.association.offers.includes('graduacao-2') &&
      period.association.term === 'second',
  );
  state.periods.splice(second, 1);
  const evidence = criterionOf(support(state), 'semester').evidence;
  expect(evidence).toMatchObject({ kind: 'counts' });
  expect(JSON.stringify(evidence)).not.toContain('sem exatamente dois');
});

test('history counts a suggestion saved without an assessment as pending', () => {
  expect(
    assessmentCounts([
      { status: 'ATENDIDO', reviewed: true },
      { status: 'ATENDIDO', reviewed: false },
      { status: 'PENDENTE', reviewed: false },
    ]),
  ).toEqual({ ATENDIDO: 1, PENDENTE: 2 });
});
