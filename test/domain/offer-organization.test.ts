import { activityCoverage } from '../../src/domain/calendar/activities/coverage.ts';
import { expect, test } from 'vitest';
import {
  applyOfferOrganization,
  offerOrganizationDraft,
  offerOrganizationIssues,
} from '../../src/domain/calendar/organization/offers.ts';
import { normalizeCalendar } from '../../src/domain/calendar/normalization/normalize.ts';
import type { ActivityState } from '../../src/domain/calendar/model.ts';
import { associationOffers } from '../../src/domain/calendar/offers.ts';

function calendar(): ActivityState {
  return {
    schemaVersion: 4 as const,
    year: 2027,
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [
      {
        id: 'shared',
        name: 'Anual',
        start: '2027-03-01',
        end: '2027-03-26',
        association: { status: 'defined', offers: ['integrado', 'graduacao'], term: 'annual' },
      },
    ],
    events: ['integrado', 'graduacao'].flatMap((modality) =>
      [0, 1].map((index) => ({
        id: `${modality}-${index}`,
        name: `${index + 1}ª etapa`,
        requirementId: `stage-${index + 1}:${modality}`,
        offers: [modality],
        start: index ? '2027-03-15' : '2027-03-01',
        end: index ? '2027-03-26' : '2027-03-12',
        kind: 'note',
        category: 'limite',
        assessmentAutoStart: '2027-03-01',
      })),
    ),
    offers: [
      {
        id: 'integrado',
        kind: 'integrado' as const,
        delivery: 'a-conferir' as const,
        organization: 'anual' as const,
        stages: { perTerm: 2 },
      },
      {
        id: 'graduacao',
        kind: 'graduacao' as const,
        delivery: 'a-conferir' as const,
        organization: 'anual' as const,
        stages: { perTerm: 2 },
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
  draft.periods[0].end = '2027-03-31';
  draft.stages[1].end = '2027-03-31';
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
  expect(integrated.targetDays).toBeUndefined();
  expect(next.events.filter((e) => e.offers?.includes('graduacao'))).toEqual(
    before.events.filter((e) => e.offers?.includes('graduacao')),
  );
  expect(
    next.events
      .filter((e) => e.offers?.includes('integrado'))
      .map((e) => [e.id, e.start, e.end, e.assessmentAutoStart]),
  ).toEqual([
    ['integrado-0', '2027-03-01', '2027-03-12', undefined],
    ['integrado-1', '2027-03-15', '2027-03-31', undefined],
  ]);
  expect(normalizeCalendar({ ...next, ignoredHistory: [] }).events).toHaveLength(4);
});

test('moving period endpoints reports live issues and the command rejects without changing anything', () => {
  const state = calendar(),
    before = structuredClone(state),
    draft = offerOrganizationDraft(state, 'integrado');
  draft.periods[0].start = '2027-03-08';
  expect(offerOrganizationIssues(state, 'integrado', draft)).toContainEqual({
    path: 'stages[0]',
    message: expect.stringMatching(/inteiramente dentro/),
  });
  expect(() => applyOfferOrganization(state, 'integrado', draft, id)).toThrow(/etapa.*período/);
  draft.periods[0].start = '2027-03-01';
  draft.periods[0].end = '2027-03-20';
  expect(
    offerOrganizationIssues(state, 'integrado', draft).some((i) => i.path === 'stages[1]'),
  ).toBe(true);
  expect(state).toEqual(before);
});

test('a stage cannot span the semester gap, overlap another stage or use another offer period', () => {
  const state = calendar(),
    draft = offerOrganizationDraft(state, 'integrado');
  draft.organization = 'semestral';
  draft.count = '1';
  draft.periods[0].end = '2027-03-12';
  draft.periods[1] = { sourceId: '', name: 'Segundo', start: '2027-03-22', end: '2027-03-26' };
  draft.stages[1].start = '2027-03-15';
  expect(
    offerOrganizationIssues(state, 'integrado', draft).some(
      (i) => i.path === 'stages[1]' && /inteiramente/.test(i.message),
    ),
  ).toBe(true);
  draft.stages[1].start = '2027-03-22';
  expect(offerOrganizationIssues(state, 'integrado', draft)).toEqual([]);
  const next = applyOfferOrganization(state, 'integrado', draft, id);
  expect(
    next.periods.filter((p) => associationOffers(p.association).includes('integrado')),
  ).toHaveLength(2);
  const bad = structuredClone(next);
  bad.events.find((e) => e.id === 'integrado-1')!.start = '2027-03-15';
  expect(() => normalizeCalendar({ ...bad, ignoredHistory: [] })).toThrow(/etapa.*período/);
});

test('existing inclusions are checked before changing periods; records are never silently deleted', () => {
  const state = calendar();
  state.events.push({
    id: 'sat',
    name: 'Reposição de sábado',
    kind: 'include',
    offers: ['integrado'],
    start: '2027-03-06',
    end: '2027-03-06',
  });
  const draft = offerOrganizationDraft(state, 'integrado');
  draft.periods[0].start = '2027-03-08';
  draft.stages[0].start = '2027-03-08';
  expect(offerOrganizationIssues(state, 'integrado', draft)).toContainEqual({
    path: 'periods',
    message: expect.stringContaining('Reposição de sábado'),
  });
  expect(() => applyOfferOrganization(state, 'integrado', draft, id)).toThrow(
    'Reposição de sábado',
  );
  expect(state.events.at(-1)?.id).toBe('sat');
});

test('splitting shared admission references preserves each offer link and dates', () => {
  const state = calendar();
  state.events.push({
    id: 'notice',
    name: 'Edital',
    kind: 'note',
    offers: ['integrado', 'graduacao'],
    start: '2027-02-01',
    end: '2027-02-01',
    publicationStatus: 'published',
    admission: { type: 'transfer', year: 2027, term: 'annual', periodId: 'shared' },
  });
  const next = applyOfferOrganization(
    state,
    'integrado',
    offerOrganizationDraft(state, 'integrado'),
    id,
  );
  const notices = next.events.filter((e) => e.admission);
  expect(notices).toHaveLength(2);
  expect(notices.find((e) => e.offers?.includes('graduacao'))).toMatchObject({
    id: 'notice',
    admission: { periodId: 'shared' },
  });
  const moved = notices.find((e) => e.offers?.includes('integrado'))!;
  expect(moved.admission?.periodId).not.toBe('shared');
  expect(next.periods.find((p) => p.id === moved.admission?.periodId)?.association).toEqual({
    status: 'defined',
    offers: ['integrado'],
    term: 'annual',
  });
});

test('calendar records no longer require or retain manual references', () => {
  const state = calendar();
  state.events.push({
    id: 'other',
    name: 'Evento',
    start: '2027-03-01',
    end: '2027-03-01',
    kind: 'note',
  });
  const draft = offerOrganizationDraft(state, 'integrado');
  expect(draft).not.toHaveProperty('evidence');
  expect(draft.stages[0]).not.toHaveProperty('evidence');
  expect(offerOrganizationIssues(state, 'integrado', draft)).toEqual([]);
  const next = normalizeCalendar({
    ...applyOfferOrganization(state, 'integrado', draft, id),
    ignoredHistory: [],
  });
  expect(
    next.events
      .filter((event) => event.requirementId?.startsWith('stage-'))
      .every((event) => !Object.hasOwn(event, 'evidence')),
  ).toBe(true);
  expect(next.events.find((event) => event.id === 'other')).not.toHaveProperty('evidence');
  expect(
    activityCoverage(next).find((row) => row.requirement.id === 'stage-1:integrado')?.coverage,
  ).toBe('complete');
  expect(next.events.find((event) => event.id === 'other')).toMatchObject({
    id: 'other',
    start: '2027-03-01',
    end: '2027-03-01',
    kind: 'note',
  });
});

test('reducing date-only stages keeps retired dates without reintroducing a source requirement', () => {
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
  const retired = two.events.filter((event) => !event.requirementId && event.category === 'limite');
  expect(retired.map((event) => [event.start, event.end])).toEqual([
    ['2027-03-15', '2027-03-19'],
    ['2027-03-22', '2027-03-26'],
  ]);
  expect(retired.every((event) => event.kind === 'note')).toBe(true);
  expect(normalizeCalendar({ ...two, ignoredHistory: [] }).events).toHaveLength(two.events.length);
});
