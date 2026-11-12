import { linksToReview } from '../../src/domain/calendar/activities/links.ts';
import { civilDate } from '../../src/domain/civil-date.ts';
import { evaluatePlan } from '../../src/domain/calendar/activities/plan-evaluation.ts';
import { expect, test } from 'vitest';
import { definedStage } from '../helpers/activity-links.ts';
import { sameActivity } from '../../src/domain/calendar/activities/activity-ref.ts';
import {
  applyOfferOrganization,
  offerOrganizationDraft,
  offerOrganizationIssues,
  offerOrganizationWarnings,
} from '../../src/domain/calendar/organization/offers.ts';
import { normalizeOfferCalendar } from '../../src/domain/calendar/normalization/normalize.ts';
import type { ActivityState } from '../../src/domain/calendar/model.ts';
import { associationOffers } from '../../src/domain/calendar/offers.ts';

function calendar(): ActivityState {
  return {
    schemaVersion: 7 as const,
    year: 2027,
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [
      {
        id: 'shared',
        name: 'Anual',
        start: civilDate('2027-03-01'),
        end: civilDate('2027-03-26'),
        association: { status: 'defined', offers: ['integrado', 'graduacao'], term: 'annual' },
      },
    ],
    events: ['integrado', 'graduacao'].flatMap((modality) =>
      [0, 1].map((index) => ({
        id: `${modality}-${index}`,
        name: `${index + 1}ª etapa`,
        activity: definedStage('stage', modality, 'annual', index + 1),
        offers: [modality],
        start: civilDate(index ? '2027-03-15' : '2027-03-01'),
        end: civilDate(index ? '2027-03-26' : '2027-03-12'),
        effect: 'note',
        category: 'limite',
        assessmentAutoStart: civilDate('2027-03-01'),
      })),
    ),
    offers: [
      {
        id: 'integrado',
        kind: 'integrado' as const,
        delivery: 'a-conferir' as const,
        organization: 'anual' as const,
        stages: { status: 'defined', perTerm: 2 },
      },
      {
        id: 'graduacao',
        kind: 'graduacao' as const,
        delivery: 'a-conferir' as const,
        organization: 'anual' as const,
        stages: { status: 'defined', perTerm: 2 },
      },
    ],
  };
}
let sequence = 0;
const id = () => `generated-${sequence++}`;

test('one application splits a shared period and keeps the other offer and all stage identities intact', () => {
  const state = calendar(),
    before = structuredClone(state),
    draft = offerOrganizationDraft(state, 'integrado');
  draft.periods[0].end = civilDate('2027-03-31');
  draft.stages[1].end = civilDate('2027-03-31');
  const next = applyOfferOrganization(state, 'integrado', draft, id);
  expect(state).toEqual(before);
  expect(next.periods).toHaveLength(2);
  expect(next.periods.find((p) => p.id === 'shared')).toEqual({
    ...before.periods[0],
    association: { status: 'defined', offers: ['graduacao'], term: 'annual' },
  });
  const integrated = next.periods.find((p) =>
    associationOffers(p.association).includes('integrado'),
  )!;
  expect(integrated.id).not.toBe('shared');
  expect(next.events.filter((e) => e.offers.includes('graduacao'))).toEqual(
    before.events.filter((e) => e.offers.includes('graduacao')),
  );
  expect(
    next.events
      .filter((e) => e.offers.includes('integrado'))
      .map((e) => [e.id, e.start, e.end, e.assessmentAutoStart]),
  ).toEqual([
    ['integrado-0', '2027-03-01', '2027-03-12', undefined],
    ['integrado-1', '2027-03-15', '2027-03-31', undefined],
  ]);
  expect(normalizeOfferCalendar(next).events).toHaveLength(4);
});

test('moving period endpoints only warns about unchanged stages and validates edited ones', () => {
  const state = calendar(),
    before = structuredClone(state),
    draft = offerOrganizationDraft(state, 'integrado');
  draft.periods[0].start = civilDate('2027-03-08');
  // A configuration change is never refused by the recorded stage it leaves out of its cycle.
  expect(offerOrganizationIssues(state, 'integrado', draft)).toEqual([]);
  expect(offerOrganizationWarnings(state, 'integrado', draft)).toEqual([
    { path: 'organization', message: expect.stringContaining('(Fora do período do ciclo)') },
  ]);
  expect(
    linksToReview(applyOfferOrganization(state, 'integrado', draft, id)).get('integrado-0'),
  ).toBe('out-of-cycle');
  draft.stages[0].start = civilDate('2027-03-02');
  expect(offerOrganizationIssues(state, 'integrado', draft)).toContainEqual({
    path: 'stages[0]',
    message: expect.stringMatching(/inteiramente dentro/),
  });
  expect(() => applyOfferOrganization(state, 'integrado', draft, id)).toThrow(/etapa.*período/);
  expect(state).toEqual(before);
});

test('a stage cannot span the semester gap, overlap another stage or use another offer period', () => {
  const state = calendar(),
    draft = offerOrganizationDraft(state, 'integrado');
  draft.organization = 'semestral';
  draft.count = '1';
  draft.periods[0].end = civilDate('2027-03-12');
  draft.periods[1] = {
    sourceId: '',
    name: 'Segundo',
    start: civilDate('2027-03-22'),
    end: civilDate('2027-03-26'),
  };
  draft.stages[1].start = civilDate('2027-03-16');
  expect(
    offerOrganizationIssues(state, 'integrado', draft).some(
      (i) => i.path === 'stages[1]' && /inteiramente/.test(i.message),
    ),
  ).toBe(true);
  draft.stages[1].start = civilDate('2027-03-22');
  expect(offerOrganizationIssues(state, 'integrado', draft)).toEqual([]);
  const next = applyOfferOrganization(state, 'integrado', draft, id);
  expect(
    next.periods.filter((p) => associationOffers(p.association).includes('integrado')),
  ).toHaveLength(2);
  // The annual stages keep their positions, to review; the semester stages are new dates.
  expect(next.events.find((e) => e.id === 'integrado-1')!.activity).toEqual(
    definedStage('stage', 'integrado', 'annual', 2),
  );
  const bad = structuredClone(next);
  bad.events.find((e) =>
    sameActivity(e.activity, definedStage('stage', 'integrado', 'second', 1)),
  )!.start = civilDate('2027-03-15');
  expect(() => normalizeOfferCalendar(bad, next)).toThrow(/etapa.*período/);
});

test('existing inclusions are checked before changing periods; records are never silently deleted', () => {
  const state = calendar();
  state.events.push({
    id: 'sat',
    name: 'Reposição de sábado',
    effect: 'include',
    offers: ['integrado'],
    start: civilDate('2027-03-06'),
    end: civilDate('2027-03-06'),
  });
  const draft = offerOrganizationDraft(state, 'integrado');
  draft.periods[0].start = civilDate('2027-03-08');
  draft.stages[0].start = civilDate('2027-03-08');
  expect(offerOrganizationIssues(state, 'integrado', draft)).toContainEqual({
    path: 'periods',
    message: expect.stringContaining('Reposição de sábado'),
  });
  expect(() => applyOfferOrganization(state, 'integrado', draft, id)).toThrow(
    'Reposição de sábado',
  );
  expect(state.events.at(-1)?.id).toBe('sat');
});

const sharedNotice = (state: ActivityState) =>
  state.events.push({
    id: 'notice',
    name: 'Edital',
    effect: 'note',
    offers: ['integrado', 'graduacao'],
    start: civilDate('2027-02-01'),
    end: civilDate('2027-02-01'),
    notice: {
      publication: 'published',
      admission: {
        type: 'transfer',
        year: 2027,
        term: 'annual',
        destinations: [
          { offerId: 'integrado', periodId: 'shared' },
          { offerId: 'graduacao', periodId: 'shared' },
        ],
      },
    },
  });

test('changing periods remaps only the destination of the reorganized offer, without splitting the notice', () => {
  const state = calendar();
  sharedNotice(state);
  const before = state.events.find((e) => e.id === 'notice')!;
  const next = applyOfferOrganization(
    state,
    'integrado',
    offerOrganizationDraft(state, 'integrado'),
    id,
  );
  const notices = next.events.filter((e) => e.notice);
  expect(notices).toHaveLength(1);
  const [notice] = notices;
  const { notice: _notice, ...rest } = before;
  expect(notice).toMatchObject(rest);
  const destinations = notice.notice!.admission!.destinations;
  expect(destinations.find((d) => d.offerId === 'graduacao')?.periodId).toBe('shared');
  const moved = destinations.find((d) => d.offerId === 'integrado')!.periodId;
  expect(moved).not.toBe('shared');
  expect(next.periods.find((p) => p.id === moved)?.association).toEqual({
    status: 'defined',
    offers: ['integrado'],
    term: 'annual',
  });
});

test('changing the organization of an offer with a notice linked to its periods stays refused', () => {
  const state = calendar();
  sharedNotice(state);
  const draft = { ...offerOrganizationDraft(state, 'integrado'), organization: 'semestral' };
  expect(offerOrganizationIssues(state, 'integrado', draft).map((i) => i.message)).toContain(
    'Revise os editais vinculados aos períodos antes de alterar a organização da oferta.',
  );
  expect(() => applyOfferOrganization(state, 'integrado', draft, id)).toThrow(
    'Revise os editais vinculados aos períodos',
  );
  // Only the offers with a destination are blocked: the other offer of the date keeps going.
  const notice = state.events.find((e) => e.id === 'notice')!;
  notice.notice!.admission!.destinations = [{ offerId: 'graduacao', periodId: 'shared' }];
  expect(offerOrganizationIssues(state, 'integrado', draft).map((i) => i.message)).not.toContain(
    'Revise os editais vinculados aos períodos antes de alterar a organização da oferta.',
  );
});

test('applying an organization covers its stages and keeps the other dates', () => {
  const state = calendar();
  state.events.push({
    id: 'other',
    name: 'Evento',
    start: civilDate('2027-03-01'),
    end: civilDate('2027-03-01'),
    effect: 'note',
    offers: ['integrado'],
  });
  const draft = offerOrganizationDraft(state, 'integrado');
  expect(offerOrganizationIssues(state, 'integrado', draft)).toEqual([]);
  const next = normalizeOfferCalendar(applyOfferOrganization(state, 'integrado', draft, id));
  expect(
    evaluatePlan(next).rows.find((row) => row.requirement.id === 'stage-1:integrado')?.coverage,
  ).toBe('complete');
  expect(next.events.find((event) => event.id === 'other')).toMatchObject({
    id: 'other',
    start: civilDate('2027-03-01'),
    end: civilDate('2027-03-01'),
    effect: 'note',
  });
});

test('reducing date-only stages keeps the retired dates and their links to review', () => {
  const state = calendar();
  const draft = offerOrganizationDraft(state, 'integrado');
  draft.count = '4';
  for (const [index, [start, end]] of [
    ['2027-03-01', '2027-03-05'],
    ['2027-03-08', '2027-03-12'],
    ['2027-03-15', '2027-03-19'],
    ['2027-03-22', '2027-03-26'],
  ].entries())
    Object.assign(draft.stages[index], { start, end });
  const four = applyOfferOrganization(state, 'integrado', draft, id);
  const twoDraft = offerOrganizationDraft(four, 'integrado');
  twoDraft.count = '2';
  const two = applyOfferOrganization(four, 'integrado', twoDraft, id);
  const review = linksToReview(two);
  const retired = two.events.filter((event) => review.has(event.id));
  // Surplus stages keep their confirmed position, which the reduced organization does not have.
  expect(retired.map((event) => [event.activity, event.start, event.end])).toEqual([
    [definedStage('stage', 'integrado', 'annual', 3), '2027-03-15', '2027-03-19'],
    [definedStage('stage', 'integrado', 'annual', 4), '2027-03-22', '2027-03-26'],
  ]);
  expect(retired.every((event) => event.effect === 'note')).toBe(true);
  expect(normalizeOfferCalendar(two, four).events).toHaveLength(two.events.length);
});
