import { expect, test } from 'vitest';
import { withoutManualSources } from '../src/manual-sources.ts';

const state = () => ({
  weekEvidence: 'Ata da semana',
  weekConfirmed: true,
  weekdays: [1, 2, 3, 4, 5],
  teacherVacations: {
    firstStart: '2027-01-01',
    firstEnd: '2027-01-31',
    evidence: 'Ata das férias',
  },
  scopeConfirmation: { status: 'covered', source: 'Texto local' },
  intakeByModality: {
    integrado: { annual: { status: 'yes', required: true, source: 'Regra local' } },
    graduacao: { first: { status: 'no', source: '' } },
  },
  events: [
    {
      id: 'manual',
      name: 'Recesso',
      kind: 'exclude',
      start: '2027-03-01',
      end: '2027-03-01',
      evidence: 'Ato local',
      deadlineExtensionCause: 'municipal-recess',
      deadlineAdjustment: { date: '2027-03-02', evidence: 'Prorrogação', reviewed: true },
    },
    {
      id: 'note',
      evidence: 'Ata',
      source: 'Atributo desconhecido não é apagado por nome',
      notes: 'Fonte: este texto livre deve permanecer.',
    },
  ],
  institutionalSnapshot: [{ id: 'inst:one', evidence: 'Norma automática', source: 'Resolução' }],
  documentSnapshot: [{ id: 'doc', source: 'Norma institucional' }],
});

test('only six known paths are removed without editing confirmations, dates, automatic references or free text', () => {
  const original = state(),
    before = structuredClone(original);
  const result = withoutManualSources(original);
  expect(result.removed).toBe(8);
  expect(original).toEqual(before);
  const expected = structuredClone(before) as Record<string, unknown>;
  delete expected.weekEvidence;
  const vacations = expected.teacherVacations as Record<string, unknown>;
  delete vacations.evidence;
  const scope = expected.scopeConfirmation as Record<string, unknown>;
  delete scope.source;
  const intake = expected.intakeByModality as Record<
    string,
    Record<string, Record<string, unknown>>
  >;
  delete intake.integrado.annual.source;
  delete intake.graduacao.first.source;
  const events = expected.events as Record<string, unknown>[];
  delete events[0].evidence;
  delete events[1].evidence;
  delete (events[0].deadlineAdjustment as Record<string, unknown>).evidence;
  expect(result.state).toEqual(expected);
  const replay = withoutManualSources(result.state);
  expect(replay).toEqual({ state: result.state, removed: 0 });
  expect(replay.state).toBe(result.state);
});

test('absent optional sections and unknown values are preserved without recursively deleting source-like keys', () => {
  for (const value of [
    null,
    undefined,
    3,
    [],
    { source: 'preservar', evidence: 'preservar' },
    { events: [null, 'preservar'], intakeByModality: { custom: { invalid: null } } },
  ]) {
    const result = withoutManualSources(value);
    expect(result.removed).toBe(0);
    expect(result.state).toBe(value);
  }
});

test('automatic records misplaced in local history block cleanup instead of losing their references', () => {
  for (const event of [
    { id: 'inst:holiday', evidence: 'Norma automática' },
    { id: 'legacy', institutional: true, evidence: 'Norma automática' },
  ]) {
    const original = { weekEvidence: 'Ata', events: [event] },
      before = structuredClone(original);
    expect(() => withoutManualSources(original)).toThrow(/institucional automática/);
    expect(original).toEqual(before);
  }
});
