import { expect, test } from 'vitest';
import { calendarOffersV4Fixture } from '../fixtures/calendar-offers-v4.ts';
import { applyEvent } from '../../src/domain/calendar/commands/events.ts';
import { applyPeriod } from '../../src/domain/calendar/commands/periods.ts';
import {
  configureAssessment,
  configureIntakeRequirement,
} from '../../src/domain/calendar/commands/organization.ts';
import {
  applyOfferOrganization,
  offerOrganizationDraft,
  offerOrganizationIssues,
  validateAddedOffers,
} from '../../src/domain/calendar/organization/offers.ts';
import { offerIds } from '../../src/domain/calendar/offers.ts';
import type { ActivityState, CalendarOffer } from '../../src/domain/calendar/model.ts';

function ids() {
  let sequence = 0;
  return () => `new-${++sequence}`;
}

test('v4 organization drafts express stages per cycle independently for repeated kinds', () => {
  const state = calendarOffersV4Fixture();
  expect(offerOrganizationDraft(state, 'graduacao').count).toBe('3');
  expect(offerOrganizationDraft(state, 'graduacao-2').count).toBe('2');
  expect(offerOrganizationDraft(state, 'graduacao-3').count).toBe('1');
  expect(
    offerOrganizationDraft(state, 'graduacao-2').stages.filter((stage) => stage.id),
  ).toHaveLength(4);
  expect(
    offerOrganizationDraft(state, 'graduacao-3').stages.filter((stage) => stage.id),
  ).toHaveLength(2);
});

test('applying one semester offer keeps four annual stage bindings and preserves sibling offers', () => {
  const state = calendarOffersV4Fixture();
  const before = structuredClone(state);
  const draft = offerOrganizationDraft(state, 'graduacao-2');
  draft.periods[0].name = 'Primeiro ciclo da Engenharia';
  const next = applyOfferOrganization(state, 'graduacao-2', draft, ids());
  expect(state).toEqual(before);
  expect(next.offers).toEqual(before.offers);
  expect(
    next.events
      .filter((event) => event.offers?.includes('graduacao-2'))
      .map((event) => event.requirementId),
  ).toEqual([
    'stage-1:graduacao-2',
    'stage-2:graduacao-2',
    'stage-3:graduacao-2',
    'stage-4:graduacao-2',
  ]);
  expect(next.events.filter((event) => !event.offers?.includes('graduacao-2'))).toEqual(
    before.events.filter((event) => !event.offers?.includes('graduacao-2')),
  );
  expect(
    next.periods.filter(
      (period) => period.id !== 'graduacao-2-first' && period.id !== 'graduacao-2-second',
    ),
  ).toEqual(
    before.periods.filter(
      (period) => period.id !== 'graduacao-2-first' && period.id !== 'graduacao-2-second',
    ),
  );
  expect(next).not.toHaveProperty('organizationByModality');
  expect(next).not.toHaveProperty('assessmentStagesByModality');
  expect(next).not.toHaveProperty('regime');
});

test('reducing semester stages keeps two bindings and retires excess dates without discarding records', () => {
  const state = calendarOffersV4Fixture();
  const draft = offerOrganizationDraft(state, 'graduacao-2');
  draft.count = '1';
  draft.stages[0].end = '2027-07-09';
  draft.stages[1].start = '2027-07-26';
  draft.stages[1].end = '2027-12-17';
  const next = applyOfferOrganization(state, 'graduacao-2', draft, ids());
  expect(next.offers.find((offer) => offer.id === 'graduacao-2')?.stages).toEqual({ perTerm: 1 });
  expect(
    next.events
      .filter((event) => event.requirementId?.endsWith(':graduacao-2'))
      .map((event) => [event.id, event.requirementId]),
  ).toEqual([
    ['graduacao-2-stage-1', 'stage-1:graduacao-2'],
    ['graduacao-2-stage-2', 'stage-2:graduacao-2'],
  ]);
  expect(
    next.events
      .filter((event) => event.id.startsWith('graduacao-2-stage-') && !event.requirementId)
      .map((event) => [event.id, event.start, event.end, event.requirementId]),
  ).toEqual([
    ['graduacao-2-stage-3', '2027-07-26', '2027-10-01', undefined],
    ['graduacao-2-stage-4', '2027-10-04', '2027-12-17', undefined],
  ]);
  expect(
    next.events
      .filter((event) => event.id.startsWith('graduacao-2-stage-') && !event.requirementId)
      .every((event) => event.kind === 'note'),
  ).toBe(true);
});

test('organization edits reject a stage in the other semester even when it fits another period', () => {
  const state = calendarOffersV4Fixture();
  const before = structuredClone(state);
  const draft = offerOrganizationDraft(state, 'graduacao-2');
  draft.stages[2].start = '2027-05-01';
  draft.stages[2].end = '2027-06-01';
  expect(
    offerOrganizationIssues(state, 'graduacao-2', draft).some(
      (issue) => issue.path === 'stages[2]' && issue.message.includes('período'),
    ),
  ).toBe(true);
  expect(() => applyOfferOrganization(state, 'graduacao-2', draft, ids())).toThrow('período');
  expect(state).toEqual(before);
});

test('v4 semester organization accepts one or two stages per cycle and rejects three', () => {
  const state = calendarOffersV4Fixture();
  const draft = offerOrganizationDraft(state, 'graduacao-2');
  draft.count = '3';
  expect(
    offerOrganizationIssues(state, 'graduacao-2', draft).some((issue) => issue.path === 'count'),
  ).toBe(true);
  expect(() => configureAssessment(state, { 'graduacao-2': '3' }, [])).toThrow('ciclo');
});

test('intake configuration changes only the selected offer identity', () => {
  const state = calendarOffersV4Fixture();
  const next = configureIntakeRequirement(state, 'graduacao-2', 'second', true);
  expect(next.offers.find((offer) => offer.id === 'graduacao-2')?.intake?.second).toEqual({
    status: 'yes',
    required: true,
  });
  expect(next.offers.find((offer) => offer.id === 'graduacao-3')).toEqual(
    state.offers.find((offer) => offer.id === 'graduacao-3'),
  );
  expect(next).not.toHaveProperty('intakeByModality');
  expect(() => configureIntakeRequirement(state, 'graduacao-2', 'annual', true)).toThrow('ciclo');
});

test('event edits enforce the owning cycle and the explicit offer id', () => {
  const state = calendarOffersV4Fixture();
  const stage = state.events.find((event) => event.id === 'graduacao-2-stage-3')!;
  expect(() =>
    applyEvent(state, { ...stage, start: '2027-02-01', end: '2027-04-16' }, [], true),
  ).toThrow('2º semestre');
  expect(() => applyEvent(state, { ...stage, offers: ['graduacao'] }, [], true)).toThrow('oferta');
  const next = applyEvent(
    state,
    { ...stage, name: 'Primeira etapa do segundo semestre' },
    [],
    true,
  );
  expect(next.events.find((event) => event.id === stage.id)?.name).toBe(
    'Primeira etapa do segundo semestre',
  );
  expect(next.events.find((event) => event.id === 'graduacao-stage-1')).toEqual(
    state.events.find((event) => event.id === 'graduacao-stage-1'),
  );
});

test('period edits select an offer id and allow overlap with another offer of the same kind', () => {
  const state = calendarOffersV4Fixture();
  const next = applyPeriod(
    state,
    {
      id: 'graduacao-2-first',
      name: 'Primeiro semestre da Engenharia',
      start: '2027-02-01',
      end: '2027-07-09',
      days: '',
      association: { status: 'defined', offers: ['graduacao-2'], term: 'first' },
    },
    [],
    ids(),
  );
  expect(next.periods.find((period) => period.id === 'graduacao-2-first')?.association).toEqual({
    status: 'defined',
    offers: ['graduacao-2'],
    term: 'first',
  });
  expect(next.periods.find((period) => period.id === 'graduacao-3-first')).toEqual(
    state.periods.find((period) => period.id === 'graduacao-3-first'),
  );
  expect(next).not.toHaveProperty('organizationByModality');
  expect(next).not.toHaveProperty('regime');
});

test('adding an opaque offer identity freezes earlier implicit events and creates its own periods', () => {
  const state = calendarOffersV4Fixture();
  state.events.push({
    id: 'earlier-global',
    name: 'Evento geral anterior',
    kind: 'note',
    start: '2027-04-01',
    end: '2027-04-01',
  });
  const newOffer: CalendarOffer = {
    id: 'graduacao-4',
    kind: 'graduacao',
    label: 'Novo curso',
    delivery: 'a-conferir',
    organization: 'semestral',
  };
  const draft = offerOrganizationDraft(state, newOffer.id);
  draft.organization = 'semestral';
  draft.count = '1';
  Object.assign(draft.periods[0], { name: 'Primeiro', start: '2027-02-01', end: '2027-07-09' });
  Object.assign(draft.periods[1], { name: 'Segundo', start: '2027-07-26', end: '2027-12-17' });
  Object.assign(draft.stages[0], { start: '2027-02-01', end: '2027-07-09' });
  Object.assign(draft.stages[1], { start: '2027-07-26', end: '2027-12-17' });
  const previousIds = offerIds(state);
  const next = applyOfferOrganization(state, newOffer.id, draft, ids(), newOffer);
  expect(next.offers.at(-1)).toEqual({ ...newOffer, stages: { perTerm: 1 } });
  expect(next.events.find((event) => event.id === 'earlier-global')?.offers).toEqual(previousIds);
  expect(
    next.events
      .filter((event) => event.offers?.includes(newOffer.id))
      .map((event) => event.requirementId),
  ).toEqual(['stage-1:graduacao-4', 'stage-2:graduacao-4']);
  expect(() => validateAddedOffers(previousIds, next)).not.toThrow();
  expect(state.events.find((event) => event.id === 'earlier-global')).not.toHaveProperty('offers');
});

test('splitting a shared v4 period preserves both admission references by offer identity', () => {
  const state: ActivityState = {
    schemaVersion: 4,
    year: 2027,
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    offers: [
      {
        id: 'graduacao',
        kind: 'graduacao',
        label: 'Curso A',
        delivery: 'a-conferir',
        organization: 'anual',
        stages: { perTerm: 2 },
      },
      {
        id: 'graduacao-2',
        kind: 'graduacao',
        label: 'Curso B',
        delivery: 'a-conferir',
        organization: 'anual',
        stages: { perTerm: 2 },
      },
    ],
    periods: [
      {
        id: 'shared',
        name: 'Ano compartilhado',
        start: '2027-02-01',
        end: '2027-12-17',
        association: { status: 'defined', offers: ['graduacao', 'graduacao-2'], term: 'annual' },
      },
    ],
    events: ['graduacao', 'graduacao-2'].flatMap((offer) =>
      [0, 1].map((index) => ({
        id: `${offer}-stage-${index + 1}`,
        name: `Etapa ${index + 1}`,
        kind: 'note',
        start: index ? '2027-07-26' : '2027-02-01',
        end: index ? '2027-12-17' : '2027-07-09',
        offers: [offer],
        requirementId: `stage-${index + 1}:${offer}`,
      })),
    ),
  };
  state.events.push({
    id: 'notice',
    name: 'Edital compartilhado',
    kind: 'note',
    start: '2027-01-01',
    end: '2027-01-01',
    offers: ['graduacao', 'graduacao-2'],
    publicationStatus: 'published',
    admission: { type: 'transfer', year: 2027, term: 'annual', periodId: 'shared' },
  });
  const next = applyOfferOrganization(
    state,
    'graduacao-2',
    offerOrganizationDraft(state, 'graduacao-2'),
    ids(),
  );
  const kept = next.events.find((event) => event.id === 'notice')!;
  const moved = next.events.find((event) => event.id !== 'notice' && event.admission)!;
  expect(kept.offers).toEqual(['graduacao']);
  expect(kept.admission?.periodId).toBe('shared');
  expect(moved.offers).toEqual(['graduacao-2']);
  expect(moved.admission?.periodId).not.toBe('shared');
  expect(
    next.periods.find((period) => period.id === moved.admission?.periodId)?.association,
  ).toEqual({ status: 'defined', offers: ['graduacao-2'], term: 'annual' });
});
