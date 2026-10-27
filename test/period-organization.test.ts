import { expect, test } from 'vitest';
import { applyPeriod, configureIntakeRequirement } from '../src/calendar-edits/commands.ts';
import { activityCoverage } from '../src/calendar-rules/index.ts';
import { normalizeCalendar } from '../src/calendar-normalize.ts';
import type { ActivityState, AcademicTerm } from '../src/domain-types.ts';

function calendar(): ActivityState {
  return {
    schemaVersion: 3,
    year: 2027,
    modalities: ['integrado', 'graduacao'],
    offer: 'integrado',
    regime: 'misto',
    organizationByModality: { integrado: 'a-classificar', graduacao: 'a-classificar' },
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    weekEvidence: 'Ata',
    periods: [],
    events: [],
    assessmentStagesByModality: {},
  };
}
function add(
  state: ActivityState,
  offer: string,
  term: AcademicTerm,
  id: string,
  start: string,
  end: string,
) {
  return applyPeriod(
    state,
    {
      name: id,
      start,
      end,
      days: '',
      association: { status: 'defined', modalities: [offer], term },
    },
    [],
    () => id,
  );
}

test('periods declare annual and semester organization atomically and survive normalization', () => {
  const original = calendar();
  const annual = add(original, 'integrado', 'annual', 'annual', '2027-02-01', '2027-12-17');
  const first = add(annual, 'graduacao', 'first', 'first', '2027-02-01', '2027-06-30');
  const second = add(first, 'graduacao', 'second', 'second', '2027-08-02', '2027-12-17');
  expect(second.organizationByModality).toEqual({ integrado: 'anual', graduacao: 'semestral' });
  expect(normalizeCalendar({ ...second, ignoredHistory: [] }).periods).toEqual(second.periods);
  expect(original.periods).toEqual([]);
  expect(original.organizationByModality?.integrado).toBe('a-classificar');
});

test('a conflicting cycle identifies the existing period without changing dates or declarations', () => {
  const annual = add(
    calendar(),
    'integrado',
    'annual',
    'Annual existente',
    '2027-02-01',
    '2027-12-17',
  );
  const original = structuredClone(annual);
  expect(() => add(annual, 'integrado', 'first', 'semester', '2027-02-01', '2027-06-30')).toThrow(
    'Annual existente',
  );
  expect(annual).toEqual(original);
});

test('unknown intake creates no configuration chore and an existing local requirement stays required', () => {
  const state: ActivityState = {
    ...calendar(),
    organizationByModality: { integrado: 'anual', graduacao: 'semestral' },
  };
  const registration = () =>
    activityCoverage(state).find(
      (row) => row.modality === 'integrado' && row.requirement.id === 'registration-0',
    );
  expect(registration()?.applicability).toBe('optional');
  state.intakeByModality = {
    integrado: { annual: { status: 'yes', required: true, source: 'Regra local' } },
  };
  expect(registration()?.applicability).toBe('required');
  expect(registration()?.coverage).toBe('pending');
});

test('a local requirement needs a source and updates only its own offer and cycle', () => {
  const state = calendar();
  state.organizationByModality = { integrado: 'anual', graduacao: 'semestral' };
  state.intakeByModality = {
    integrado: { annual: { status: 'no', source: 'Declaração anterior' } },
  };
  const original = structuredClone(state);
  expect(() => configureIntakeRequirement(state, 'graduacao', 'second', true, '')).toThrow(
    'referência',
  );
  const configured = configureIntakeRequirement(state, 'graduacao', 'second', true, 'Regra local');
  expect(configured.intakeByModality?.integrado).toEqual(original.intakeByModality?.integrado);
  expect(configured.intakeByModality?.graduacao?.second).toEqual({
    status: 'yes',
    required: true,
    source: 'Regra local',
  });
  const optional = configureIntakeRequirement(
    configured,
    'graduacao',
    'second',
    false,
    'Regra local',
  );
  expect(optional.intakeByModality?.graduacao?.second).toEqual({
    status: 'yes',
    required: false,
    source: 'Regra local',
  });
  expect(() => configureIntakeRequirement(state, 'graduacao', 'annual', true, 'Regra')).toThrow(
    'ciclo',
  );
  expect(state).toEqual(original);
});

test('editing a legacy period classifies it without changing its identity or dates', () => {
  const state = calendar();
  state.modalities = ['integrado'];
  state.organizationByModality = { integrado: 'a-classificar' };
  state.conversion = { from: 2, organization: 'pending' };
  state.periods = [
    {
      id: 'legacy',
      name: 'Anual',
      start: '2027-02-01',
      end: '2027-12-17',
      association: { status: 'a-classificar' },
    },
  ];
  const classified = applyPeriod(
    state,
    {
      ...state.periods[0],
      name: 'Anual',
      days: '',
      association: { status: 'defined', modalities: ['integrado'], term: 'annual' },
    },
    [],
    () => 'unused',
  );
  expect(classified.periods[0]).toMatchObject({
    id: 'legacy',
    start: '2027-02-01',
    end: '2027-12-17',
  });
  expect(classified.conversion?.organization).toBe('classified');
  expect(state.conversion.organization).toBe('pending');
});

test('preserved intake from an old cycle does not block periods of the current organization', () => {
  const state = calendar();
  state.organizationByModality = { integrado: 'semestral', graduacao: 'semestral' };
  state.intakeByModality = {
    integrado: { annual: { status: 'yes', required: true, source: 'Regra anual anterior' } },
  };
  const original = structuredClone(state);
  const applied = add(state, 'integrado', 'first', 'first', '2027-02-01', '2027-06-30');
  expect(applied.periods).toHaveLength(1);
  expect(applied.intakeByModality).toEqual(original.intakeByModality);
  expect(state).toEqual(original);
  expect(() =>
    add(state, 'integrado', 'annual', 'annual', '2027-02-01', '2027-12-17'),
  ).not.toThrow();
  const annual: ActivityState = {
    ...state,
    organizationByModality: { integrado: 'anual', graduacao: 'semestral' },
  };
  expect(() => add(annual, 'integrado', 'first', 'first', '2027-02-01', '2027-06-30')).toThrow(
    'exigência local',
  );
});

test('changing a cycle rejects activity records that would lose their offer even when their ID remains', () => {
  let state = calendar();
  state.organizationByModality = { integrado: 'anual', graduacao: 'anual' };
  state = add(state, 'integrado', 'annual', 'integrated-year', '2027-02-01', '2027-12-17');
  state = add(state, 'graduacao', 'annual', 'undergraduate-year', '2027-02-01', '2027-12-17');
  state.events = [
    {
      id: 'final-result',
      name: 'Resultado final da graduação',
      requirementId: 'final-0',
      start: '2027-12-17',
      end: '2027-12-17',
      kind: 'note',
      category: 'prazo',
      modalities: ['graduacao'],
      evidence: 'Decisão de graduação',
    },
  ];
  const original = structuredClone(state);
  const changed = {
    id: 'undergraduate-year',
    name: 'Primeiro semestre',
    start: '2027-02-01',
    end: '2027-06-30',
    days: '',
    association: { status: 'defined' as const, modalities: ['graduacao'], term: 'first' as const },
  };
  expect(() => applyPeriod(state, changed, [], () => 'unused')).toThrow(
    'Resultado final da graduação',
  );
  expect(state).toEqual(original);
  state.events = [];
  expect(applyPeriod(state, changed, [], () => 'unused').organizationByModality?.graduacao).toBe(
    'semestral',
  );
});

test('semester teacher deadlines stay valid when their offer changes to annual organization', () => {
  let state = calendar();
  state.organizationByModality = { integrado: 'anual', graduacao: 'semestral' };
  state = add(state, 'graduacao', 'first', 'undergraduate-first', '2027-02-01', '2027-06-30');
  state.events = ['pit-1', 'rit-1', 'teaching-plan-1'].map((requirementId) => ({
    id: requirementId,
    requirementId,
    name: requirementId,
    start: '2027-04-01',
    end: '2027-04-01',
    kind: 'note',
    category: 'prazo',
    modalities: ['graduacao'],
    evidence: 'Prazos docentes',
  }));
  const applied = applyPeriod(
    state,
    {
      id: 'undergraduate-first',
      name: 'Ano letivo',
      start: '2027-02-01',
      end: '2027-12-17',
      days: '',
      association: { status: 'defined', modalities: ['graduacao'], term: 'annual' },
    },
    [],
    () => 'unused',
  );
  expect(applied.organizationByModality?.graduacao).toBe('anual');
  expect(applied.events).toEqual(state.events);
});
