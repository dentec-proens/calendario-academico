import { expect, test } from 'vitest';
import { calendarOffersV4Fixture } from '../fixtures/calendar-offers-v4.ts';
import { activityChecklist } from '../../src/domain/calendar/activities/checklist.ts';
import { activityCoverage } from '../../src/domain/calendar/activities/coverage.ts';
import { assessmentCount } from '../../src/domain/calendar/activities/assessment.ts';
import { assessmentCycleIssue } from '../../src/domain/calendar/activities/assessment-intervals.ts';
import { validateActivityRecord } from '../../src/domain/calendar/activities/validation.ts';
import { policyFor } from '../../src/domain/policies/registry.ts';

test('etapas de ofertas do mesmo tipo preservam identidades e reiniciam os nomes por ciclo', () => {
  const state = calendarOffersV4Fixture();
  const stages = activityChecklist(state).filter((row) => row.id.startsWith('stage-'));
  expect(stages).toHaveLength(13);
  expect(assessmentCount(state, 'graduacao')).toBe(3);
  expect(assessmentCount(state, 'graduacao-2')).toBe(4);
  expect(assessmentCount(state, 'graduacao-3')).toBe(2);
  const third = stages.find((row) => row.id === 'stage-3:graduacao-2');
  expect(third).toMatchObject({
    offerId: 'graduacao-2',
    modalities: ['graduacao'],
    term: 'second',
  });
  expect(third?.name).toContain('1ª etapa de avaliação do 2º semestre');
  expect(third?.name).toContain('bimestral');
  expect(stages.find((row) => row.id === 'stage-2:graduacao-3')?.name).toContain(
    '1ª etapa de avaliação do 2º semestre',
  );
  expect(stages.find((row) => row.id === 'stage-3:graduacao')?.name).toContain('3ª etapa');
  expect(stages.find((row) => row.id === 'stage-3:graduacao')?.name).toContain('trimestral');
});

test('aplicabilidade depende do tipo, mas o escopo das linhas de ciclo depende da identidade', () => {
  const state = calendarOffersV4Fixture();
  const policy = policyFor(state.year);
  const rows = policy.requirements(state);
  const family = rows.find((row) => row.id === 'family-meeting')!;
  const annual = rows.find((row) => row.id === 'final-0')!;
  const first = rows.find((row) => row.id === 'final-1')!;
  expect(policy.applicability(state, family, 'integrado')).toBe('required');
  for (const id of ['graduacao', 'graduacao-2', 'graduacao-3'])
    expect(policy.applicability(state, family, id)).toBe('optional');
  expect(policy.applicability(state, annual, 'graduacao')).toBe('required');
  expect(policy.applicability(state, annual, 'graduacao-2')).toBe('optional');
  expect(policy.applicability(state, first, 'graduacao')).toBe('optional');
  expect(policy.applicability(state, first, 'graduacao-2')).toBe('required');
  const pit = rows.find((row) => row.id === 'pit-1')!;
  expect(policy.applicability(state, pit, 'graduacao')).toBe('required');
});

test('cobertura de uma etapa não atende a outra oferta de graduação', () => {
  const state = calendarOffersV4Fixture();
  const stage = state.events.find((event) => event.requirementId === 'stage-1:graduacao-2')!;
  const coverage = activityCoverage(state, [stage]);
  expect(coverage.find((row) => row.requirement.id === stage.requirementId)).toMatchObject({
    offerId: 'graduacao-2',
    coverage: 'complete',
    offer: { kind: 'graduacao', label: 'Engenharia Elétrica' },
  });
  expect(coverage.find((row) => row.requirement.id === 'stage-1:graduacao-3')).toMatchObject({
    offerId: 'graduacao-3',
    coverage: 'pending',
  });
});

test('escopo e configuração de ingresso são independentes em ofertas do mesmo tipo', () => {
  const state = calendarOffersV4Fixture();
  const policy = policyFor(state.year);
  state.offers[2].scope = { status: 'own-regulation' };
  state.offers[3].intake = { first: { status: 'yes', required: true } };
  const registration = policy.requirements(state).find((row) => row.id === 'registration-1')!;
  expect(policy.applicability(state, registration, 'graduacao-2')).toBe('unconfigured');
  expect(policy.applicability(state, registration, 'graduacao-3')).toBe('required');
  expect(policy.countingMinimums(state, 'graduacao-2')).toEqual({ annual: null, semester: null });
  expect(policy.countingMinimums(state, 'graduacao-3')).toEqual({ annual: 200, semester: 100 });
  expect(policy.window(state)).not.toBeNull();
  state.offers.forEach((offer) => {
    offer.scope = { status: 'own-regulation' };
  });
  expect(policy.window(state)).toBeNull();
});

test('nova edição exige o próprio semestre sem impedir salvar outros dados migrados', () => {
  const state = calendarOffersV4Fixture();
  const original = state.events.find((event) => event.requirementId === 'stage-3:graduacao-2')!;
  const migrated = { ...original, start: '2027-02-01', end: '2027-03-01' };
  expect(assessmentCycleIssue(state, migrated)).toContain('2º semestre');
  expect(() => validateActivityRecord(state, migrated)).not.toThrow();
  expect(assessmentCycleIssue(state, original)).toBeUndefined();
  const unclassified = {
    ...state,
    offers: state.offers.map((offer) =>
      offer.id === 'graduacao-2'
        ? { ...offer, organization: 'a-classificar' as const, stages: undefined }
        : offer,
    ),
    periods: [],
  };
  expect(() => validateActivityRecord(unclassified, migrated)).not.toThrow();
  expect(assessmentCycleIssue(unclassified, migrated)).toContain('Defina a organização');
});

test('sequência de novas etapas é conferida dentro do ciclo da mesma oferta', () => {
  const state = calendarOffersV4Fixture();
  const second = state.events.find((event) => event.requirementId === 'stage-2:graduacao-2')!;
  expect(assessmentCycleIssue(state, { ...second, start: '2027-04-16' })).toContain('sequência');
  const first = state.events.find((event) => event.requirementId === 'stage-1:graduacao-2')!;
  expect(
    assessmentCycleIssue(
      { ...state, events: [...state.events, { ...first, id: 'duplicate' }] },
      first,
    ),
  ).toContain('duplicadas');
});
