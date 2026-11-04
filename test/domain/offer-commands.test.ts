import { civilDate } from '../../src/domain/civil-date.ts';
import { expect, test } from 'vitest';
import { definedStage, rowLink } from '../helpers/activity-links.ts';
import { isStageActivity } from '../../src/domain/calendar/activities/activity-ref.ts';
import { calendarOffersFixture } from '../fixtures/calendar-offers.ts';
import { applyDate } from '../helpers/date-commands.ts';
import {
  configureIntakeRequirement,
  offerRemovalPreview,
  removeOffer,
} from '../../src/domain/calendar/commands/organization.ts';
import {
  normalizeOfferCalendar,
  offerCalendarContent,
} from '../../src/domain/calendar/normalization/normalize.ts';
import { prepareOfferCalendarSave } from '../../src/domain/calendar/prepare-save.ts';
import { linksToReview } from '../../src/domain/calendar/activities/links.ts';
import {
  applyOfferOrganization,
  offerOrganizationWarnings,
  offerOrganizationDraft,
  offerOrganizationIssues,
  validateAddedOffers,
  type NewOffer,
} from '../../src/domain/calendar/organization/offers.ts';
import { offerIds } from '../../src/domain/calendar/offers.ts';
import type { ActivityState } from '../../src/domain/calendar/model.ts';

function ids() {
  let sequence = 0;
  return () => `new-${++sequence}`;
}

test('organization drafts express stages per cycle independently for repeated kinds', () => {
  const state = calendarOffersFixture();
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
  const state = calendarOffersFixture();
  const before = structuredClone(state);
  const draft = offerOrganizationDraft(state, 'graduacao-2');
  draft.periods[0].name = 'Primeiro ciclo da Engenharia';
  const next = applyOfferOrganization(state, 'graduacao-2', draft, ids());
  expect(state).toEqual(before);
  expect(next.offers).toEqual(before.offers);
  expect(
    next.events
      .filter((event) => event.offers.includes('graduacao-2'))
      .map((event) => event.activity),
  ).toEqual([1, 2, 3, 4].map((n) => rowLink(next, `stage-${n}:graduacao-2`)));
  expect(next.events.filter((event) => !event.offers.includes('graduacao-2'))).toEqual(
    before.events.filter((event) => !event.offers.includes('graduacao-2')),
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

test('reducing semester stages keeps every binding and leaves excess dates to review', () => {
  const state = calendarOffersFixture();
  const draft = offerOrganizationDraft(state, 'graduacao-2');
  draft.count = '1';
  draft.stages[0].end = civilDate('2027-07-09');
  draft.stages[1].start = civilDate('2027-07-26');
  draft.stages[1].end = civilDate('2027-12-17');
  const next = applyOfferOrganization(state, 'graduacao-2', draft, ids());
  expect(next.offers.find((offer) => offer.id === 'graduacao-2')?.stages).toEqual({
    status: 'defined',
    perTerm: 1,
  });
  const recorded = (id: string) => state.events.find((event) => event.id === id)!;
  // A confirmed stage keeps its position when the count changes: each draft
  // stage updates the date already at its position, and the others stay as recorded, to review.
  expect(
    next.events
      .filter(
        (event) => isStageActivity(event.activity) && event.activity.offerId === 'graduacao-2',
      )
      .map((event) => [event.id, event.activity, event.start, event.end]),
  ).toEqual([
    [
      'graduacao-2-stage-1',
      definedStage('stage', 'graduacao-2', 'first', 1),
      '2027-02-01',
      '2027-07-09',
    ],
    [
      'graduacao-2-stage-2',
      definedStage('stage', 'graduacao-2', 'first', 2),
      recorded('graduacao-2-stage-2').start,
      recorded('graduacao-2-stage-2').end,
    ],
    [
      'graduacao-2-stage-3',
      definedStage('stage', 'graduacao-2', 'second', 1),
      '2027-07-26',
      '2027-12-17',
    ],
    [
      'graduacao-2-stage-4',
      definedStage('stage', 'graduacao-2', 'second', 2),
      recorded('graduacao-2-stage-4').start,
      recorded('graduacao-2-stage-4').end,
    ],
  ]);
  const review = linksToReview(next);
  expect(review.get('graduacao-2-stage-2')).toBe('not-generated');
  expect(review.get('graduacao-2-stage-4')).toBe('not-generated');
  expect(offerOrganizationWarnings(state, 'graduacao-2', draft).map((w) => w.message)).toEqual([
    expect.stringContaining('ficará em Vínculo a conferir (Atividade não gerada)'),
    expect.stringContaining('ficará em Vínculo a conferir (Atividade não gerada)'),
  ]);
});

test('organization edits reject a stage in the other semester even when it fits another period', () => {
  const state = calendarOffersFixture();
  const before = structuredClone(state);
  const draft = offerOrganizationDraft(state, 'graduacao-2');
  draft.stages[2].start = civilDate('2027-05-01');
  draft.stages[2].end = civilDate('2027-06-01');
  expect(
    offerOrganizationIssues(state, 'graduacao-2', draft).some(
      (issue) => issue.path === 'stages[2]' && issue.message.includes('período'),
    ),
  ).toBe(true);
  expect(() => applyOfferOrganization(state, 'graduacao-2', draft, ids())).toThrow('período');
  expect(state).toEqual(before);
});

test('semester organization accepts one or two stages per cycle and rejects three', () => {
  const state = calendarOffersFixture();
  const draft = offerOrganizationDraft(state, 'graduacao-2');
  draft.count = '3';
  expect(
    offerOrganizationIssues(state, 'graduacao-2', draft).some((issue) => issue.path === 'count'),
  ).toBe(true);
});

test('intake configuration changes only the selected offer identity', () => {
  const state = calendarOffersFixture();
  const next = configureIntakeRequirement(state, 'graduacao-2', 'second', true);
  expect(next.offers.find((offer) => offer.id === 'graduacao-2')?.intake?.second).toBe(true);
  expect(next.offers.find((offer) => offer.id === 'graduacao-3')).toEqual(
    state.offers.find((offer) => offer.id === 'graduacao-3'),
  );
  expect(next).not.toHaveProperty('intakeByModality');
  expect(() => configureIntakeRequirement(state, 'graduacao-2', 'annual', true)).toThrow('ciclo');
});

test('event edits enforce the owning cycle and the explicit offer id', () => {
  const state = calendarOffersFixture();
  const stage = state.events.find((event) => event.id === 'graduacao-2-stage-3')!;
  expect(() =>
    applyDate(
      state,
      { ...stage, start: civilDate('2027-02-01'), end: civilDate('2027-04-16') },
      [],
      true,
    ),
  ).toThrow('2º semestre');
  expect(() => applyDate(state, { ...stage, offers: ['graduacao'] }, [], true)).toThrow('oferta');
  const next = applyDate(state, { ...stage, name: 'Primeira etapa do segundo semestre' }, [], true);
  expect(next.events.find((event) => event.id === stage.id)?.name).toBe(
    'Primeira etapa do segundo semestre',
  );
  expect(next.events.find((event) => event.id === 'graduacao-stage-1')).toEqual(
    state.events.find((event) => event.id === 'graduacao-stage-1'),
  );
});

test('adding an opaque offer identity keeps the offers of earlier dates and creates its own periods', () => {
  const state = calendarOffersFixture();
  state.events.push({
    id: 'earlier-global',
    name: 'Evento geral anterior',
    effect: 'note',
    offers: offerIds(state),
    start: civilDate('2027-04-01'),
    end: civilDate('2027-04-01'),
  });
  const newOffer: NewOffer = {
    id: 'graduacao-4',
    kind: 'graduacao',
    label: 'Novo curso',
    delivery: 'a-conferir',
  };
  const draft = offerOrganizationDraft(state, newOffer.id);
  draft.organization = 'semestral';
  draft.count = '1';
  Object.assign(draft.periods[0], {
    name: 'Primeiro',
    start: civilDate('2027-02-01'),
    end: civilDate('2027-07-09'),
  });
  Object.assign(draft.periods[1], {
    name: 'Segundo',
    start: civilDate('2027-07-26'),
    end: civilDate('2027-12-17'),
  });
  Object.assign(draft.stages[0], { start: civilDate('2027-02-01'), end: civilDate('2027-07-09') });
  Object.assign(draft.stages[1], { start: civilDate('2027-07-26'), end: civilDate('2027-12-17') });
  const previousIds = offerIds(state);
  // Without the campus's choice the offer does not enter the calendar.
  const undecided = { ...draft, organization: '' };
  expect(offerOrganizationIssues(state, newOffer.id, undecided, newOffer)).toContainEqual({
    path: 'organization',
    message: 'Selecione a organização da oferta.',
  });
  expect(() => applyOfferOrganization(state, newOffer.id, undecided, ids(), newOffer)).toThrow(
    'Selecione a organização',
  );
  const next = applyOfferOrganization(state, newOffer.id, draft, ids(), newOffer);
  expect(next.offers.at(-1)).toEqual({
    ...newOffer,
    organization: 'semestral',
    stages: { status: 'defined', perTerm: 1 },
  });
  // Not extended: the date keeps the offers it listed.
  expect(next.events.find((event) => event.id === 'earlier-global')?.offers).toEqual(previousIds);
  expect(
    next.events
      .filter((event) => event.offers.includes(newOffer.id))
      .map((event) => event.activity),
  ).toEqual([1, 2].map((n) => rowLink(next, `stage-${n}:graduacao-4`)));
  expect(() => validateAddedOffers(previousIds, next)).not.toThrow();
  expect(state.events.find((event) => event.id === 'earlier-global')?.offers).toEqual(previousIds);
});

test('splitting a shared period remaps only the destination of the reorganized offer', () => {
  const state: ActivityState = {
    schemaVersion: 6,
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
        stages: { status: 'defined', perTerm: 2 },
      },
      {
        id: 'graduacao-2',
        kind: 'graduacao',
        label: 'Curso B',
        delivery: 'a-conferir',
        organization: 'anual',
        stages: { status: 'defined', perTerm: 2 },
      },
    ],
    periods: [
      {
        id: 'shared',
        name: 'Ano compartilhado',
        start: civilDate('2027-02-01'),
        end: civilDate('2027-12-17'),
        association: { status: 'defined', offers: ['graduacao', 'graduacao-2'], term: 'annual' },
      },
    ],
    events: ['graduacao', 'graduacao-2'].flatMap((offer) =>
      [0, 1].map((index) => ({
        id: `${offer}-stage-${index + 1}`,
        name: `Etapa ${index + 1}`,
        effect: 'note',
        start: civilDate(index ? '2027-07-26' : '2027-02-01'),
        end: civilDate(index ? '2027-12-17' : '2027-07-09'),
        offers: [offer],
        activity: definedStage('stage', offer, 'annual', index + 1),
      })),
    ),
  };
  state.events.push({
    id: 'notice',
    name: 'Edital compartilhado',
    effect: 'note',
    start: civilDate('2027-01-01'),
    end: civilDate('2027-01-01'),
    offers: ['graduacao', 'graduacao-2'],
    notice: {
      publication: 'published',
      admission: {
        type: 'transfer',
        year: 2027,
        term: 'annual',
        destinations: [
          { offerId: 'graduacao', periodId: 'shared' },
          { offerId: 'graduacao-2', periodId: 'shared' },
        ],
      },
    },
  });
  const next = applyOfferOrganization(
    state,
    'graduacao-2',
    offerOrganizationDraft(state, 'graduacao-2'),
    ids(),
  );
  const notices = next.events.filter((event) => event.notice);
  expect(notices.map((event) => event.id)).toEqual(['notice']);
  const [notice] = notices;
  expect(notice.offers).toEqual(['graduacao', 'graduacao-2']);
  const destinations = notice.notice!.admission!.destinations;
  expect(destinations[0]).toEqual({ offerId: 'graduacao', periodId: 'shared' });
  expect(destinations[1].offerId).toBe('graduacao-2');
  expect(destinations[1].periodId).not.toBe('shared');
  expect(
    next.periods.find((period) => period.id === destinations[1].periodId)?.association,
  ).toEqual({ status: 'defined', offers: ['graduacao-2'], term: 'annual' });
});

test('removing an offer takes its periods, stages, own dates, destinations and scope, keeping the rest', () => {
  const state = calendarOffersFixture();
  const day = civilDate('2027-03-10');
  state.events.push(
    {
      id: 'shared-date',
      name: 'Reunião compartilhada',
      start: day,
      end: day,
      effect: 'note',
      offers: ['integrado', 'graduacao-2'],
    },
    {
      id: 'own-date',
      name: 'Data só da Engenharia',
      start: day,
      end: day,
      effect: 'note',
      offers: ['graduacao-2'],
    },
    {
      id: 'notice',
      name: 'Edital compartilhado',
      start: day,
      end: day,
      effect: 'note',
      notice: {
        publication: 'planned',
        admission: {
          type: 'transfer',
          year: 2027,
          term: 'first',
          destinations: [
            { offerId: 'graduacao-2', periodId: 'graduacao-2-first' },
            { offerId: 'graduacao-3', periodId: 'graduacao-3-first' },
          ],
        },
      },
      offers: ['graduacao-2', 'graduacao-3'],
    },
  );
  const before = structuredClone(state);
  const preview = offerRemovalPreview(state, 'graduacao-2');
  expect(preview.removedPeriods).toEqual(['1º semestre', '2º semestre']);
  expect(preview.removedDates).toHaveLength(5);
  expect(preview.removedDates).toContain('Data só da Engenharia');
  expect(preview.narrowedDates).toEqual(['Reunião compartilhada', 'Edital compartilhado']);
  const next = removeOffer(state, 'graduacao-2', []);
  expect(state).toEqual(before);
  expect(offerIds(next)).toEqual(['integrado', 'graduacao', 'graduacao-3']);
  expect(next.periods.map((period) => period.id)).toEqual(
    before.periods.filter((period) => !period.id.startsWith('graduacao-2')).map((p) => p.id),
  );
  expect(
    next.events.some(
      (event) =>
        event.offers.includes('graduacao-2') ||
        (event.activity && 'offerId' in event.activity && event.activity.offerId === 'graduacao-2'),
    ),
  ).toBe(false);
  expect(next.events.find((event) => event.id === 'own-date')).toBeUndefined();
  expect(next.events.find((event) => event.id === 'shared-date')?.offers).toEqual(['integrado']);
  expect(
    next.events.find((event) => event.id === 'notice')?.notice?.admission?.destinations,
  ).toEqual([{ offerId: 'graduacao-3', periodId: 'graduacao-3-first' }]);
  // The result is a valid calendar, and a draft may save it; a submitted calendar may not.
  const previous = normalizeOfferCalendar(state, state);
  expect(normalizeOfferCalendar(next, previous)).toBeTruthy();
  const context = { storedContent: offerCalendarContent(previous), catalogue: { events: [] } };
  expect(
    prepareOfferCalendarSave(previous, next, {
      ...context,
      recalculate: false,
      allowOfferRemoval: true,
    }).offerKinds,
  ).toEqual(['integrado', 'graduacao']);
  expect(() =>
    prepareOfferCalendarSave(previous, next, { ...context, recalculate: false }),
  ).toThrow('não podem ser removidas');
  expect(() => removeOffer(state, 'outra', [])).toThrow('não pertence');
  const single = { ...state, offers: state.offers.slice(0, 1) };
  expect(() => offerRemovalPreview(single, 'integrado')).toThrow('pelo menos uma oferta');
});
