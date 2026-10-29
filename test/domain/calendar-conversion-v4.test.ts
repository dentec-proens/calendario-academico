import { expect, test } from 'vitest';
import { configureIntakeRequirement } from '../../src/domain/calendar/commands/organization.ts';
import { convertCalendarV2 } from '../../src/domain/calendar/normalization/conversion.ts';
import {
  calendarV3OrphanKeys,
  convertCalendarV3,
  type LegacyCalendarInput,
} from '../../src/domain/calendar/normalization/conversion-v4.ts';

const context = { year: 2027, modalities: ['graduacao'] };

function calendar(overrides: Partial<LegacyCalendarInput> = {}): LegacyCalendarInput {
  return {
    schemaVersion: 3,
    rulesetVersion: 'consup-292-2027-v1',
    regime: 'anual',
    organizationByModality: { graduacao: 'anual' },
    assessmentStagesByModality: { graduacao: 4 },
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [
      {
        id: 'annual',
        name: 'Ano letivo',
        start: '2027-02-01',
        end: '2027-12-17',
        targetDays: 200,
        association: { status: 'defined', modalities: ['graduacao'], term: 'annual' },
      },
    ],
    events: [
      {
        id: 'first-stage',
        name: 'Primeira etapa',
        start: '2027-02-01',
        end: '2027-04-30',
        kind: 'note',
        category: 'limite',
        requirementId: 'stage-1:graduacao',
        modalities: ['graduacao'],
        assessmentAutoStart: '2027-02-01',
      },
    ],
    ...overrides,
  };
}

test.each([2, 3, 4])('annual v3 preserves %i stages per annual cycle', (count) => {
  const converted = convertCalendarV3(
    calendar({ assessmentStagesByModality: { graduacao: count } }),
    context,
  );
  expect(converted.offers).toEqual([
    {
      id: 'graduacao',
      kind: 'graduacao',
      delivery: 'a-conferir',
      organization: 'anual',
      stages: { perTerm: count },
    },
  ]);
});

test.each([
  [2, 1],
  [4, 2],
])('semester v3 with %i annual stages becomes %i per semester', (count, perTerm) => {
  const converted = convertCalendarV3(
    calendar({
      organizationByModality: { graduacao: 'semestral' },
      assessmentStagesByModality: { graduacao: count },
    }),
    context,
  );
  expect(converted.offers[0]).toMatchObject({ organization: 'semestral', stages: { perTerm } });
  expect(converted.events[0].requirementId).toBe('stage-1:graduacao');
});

test('semester v3 with three annual stages keeps its records and leaves stages undefined', () => {
  const state = calendar({
    organizationByModality: { graduacao: 'semestral' },
    assessmentStagesByModality: { graduacao: 3 },
    events: [
      {
        id: 'third-stage',
        name: 'Terceira etapa existente',
        start: '2027-10-01',
        end: '2027-12-17',
        kind: 'note',
        modalities: ['graduacao'],
        requirementId: 'stage-3:graduacao',
      },
    ],
  });
  const converted = convertCalendarV3(state, context);
  expect(converted.offers[0]).not.toHaveProperty('stages');
  expect(converted.events[0]).toEqual({
    id: 'third-stage',
    name: 'Terceira etapa existente',
    start: '2027-10-01',
    end: '2027-12-17',
    kind: 'note',
    offers: ['graduacao'],
    requirementId: 'stage-3:graduacao',
  });
});

test.each([
  { organizationByModality: { graduacao: 'a-classificar' as const } },
  { organizationByModality: undefined },
  { assessmentStagesByModality: {} },
])('unclassified organizations and absent stages are never inferred from the regime', (extra) => {
  const converted = convertCalendarV3(calendar(extra), context);
  expect(converted.offers[0]).not.toHaveProperty('stages');
  if ('organizationByModality' in extra)
    expect(converted.offers[0].organization).toBe('a-classificar');
});

test('mixed and combined v3 content preserves per-offer organization, scope and intake', () => {
  const converted = convertCalendarV3(
    calendar({
      regime: 'misto',
      modalities: ['integrado', 'graduacao', 'posgraduacao'],
      organizationByModality: {
        integrado: 'anual',
        graduacao: 'semestral',
        posgraduacao: 'a-classificar',
      },
      assessmentStagesByModality: { integrado: 3, graduacao: 4 },
      scopeConfirmation: { status: 'covered' },
      intakeByModality: {
        integrado: { annual: { status: 'yes', required: true } },
        graduacao: { first: { status: 'no' }, second: { status: 'unknown' } },
      },
    }),
    { year: 2027, modalities: ['integrado', 'graduacao', 'posgraduacao'] },
  );
  expect(converted.offers).toEqual([
    {
      id: 'integrado',
      kind: 'integrado',
      delivery: 'a-conferir',
      organization: 'anual',
      stages: { perTerm: 3 },
      scope: { status: 'covered' },
      intake: { annual: { status: 'yes', required: true } },
    },
    {
      id: 'graduacao',
      kind: 'graduacao',
      delivery: 'a-conferir',
      organization: 'semestral',
      stages: { perTerm: 2 },
      scope: { status: 'covered' },
      intake: { first: { status: 'no' }, second: { status: 'unknown' } },
    },
    {
      id: 'posgraduacao',
      kind: 'posgraduacao',
      delivery: 'a-conferir',
      organization: 'a-classificar',
    },
  ]);
});

test('own-regulation is copied to each non-excluded offer without adopting a ruleset', () => {
  const state = calendar({
    rulesetVersion: undefined,
    scopeConfirmation: { status: 'own-regulation' },
  });
  const converted = convertCalendarV3(state, context);
  expect(converted.offers[0].scope).toEqual({ status: 'own-regulation' });
  expect(converted).not.toHaveProperty('rulesetVersion');
  expect(convertCalendarV3(calendar(), context).rulesetVersion).toBe('consup-292-2027-v1');
});

test('v2 pending organization remains unclassified and preserves all original dates', () => {
  const state = calendar({
    schemaVersion: 2,
    regime: 'misto',
    organizationByModality: undefined,
  });
  const converted = convertCalendarV3(state, context);
  expect(converted.offers[0].organization).toBe('a-classificar');
  expect(converted.offers[0]).not.toHaveProperty('stages');
  expect(converted.periods[0]).toEqual({
    ...state.periods[0],
    association: { status: 'a-classificar' },
  });
  expect(converted.events[0].requirementId).toBe('stage-1:graduacao');
});

test.each([undefined, 2])(
  'v2 annual content, including a missing schema version, converts safely',
  (schemaVersion) => {
    const state = calendar({
      schemaVersion,
      organizationByModality: undefined,
      secondSemesterIntake: false,
    });
    const converted = convertCalendarV3(state, context);
    expect(converted.offers[0]).toMatchObject({
      organization: 'anual',
      stages: { perTerm: 4 },
      intake: { second: { status: 'no' } },
    });
    expect(converted.periods[0].association).toEqual({
      status: 'defined',
      offers: ['graduacao'],
      term: 'annual',
    });
  },
);

test('v2 semester conversion keeps the semantic semester identity in an unordered list', () => {
  const state = calendar({
    schemaVersion: 2,
    regime: 'semestral',
    organizationByModality: undefined,
    periods: [
      { id: 'second', name: '2º semestre', start: '2027-08-02', end: '2027-12-17' },
      { id: 'first', name: '1º semestre', start: '2027-02-01', end: '2027-06-30' },
    ],
  });
  const converted = convertCalendarV3(state, context);
  expect(converted.offers[0]).toMatchObject({ organization: 'semestral', stages: { perTerm: 2 } });
  expect(converted.periods.map((period) => period.association)).toEqual([
    { status: 'defined', offers: ['graduacao'], term: 'second' },
    { status: 'defined', offers: ['graduacao'], term: 'first' },
  ]);
});

test.each([true, false])(
  'combined v2 does not attribute a global second-intake answer (%s) to either offer',
  (secondSemesterIntake) => {
    const state = calendar({
      schemaVersion: 2,
      organizationByModality: undefined,
      secondSemesterIntake,
      periods: [],
    });
    const converted = convertCalendarV3(state, {
      year: 2027,
      modalities: ['graduacao', 'integrado'],
    });
    expect(converted.offers.map((offer) => offer.intake)).toEqual([
      { second: { status: 'unknown' } },
      { second: { status: 'unknown' } },
    ]);
    expect(converted.offers.map((offer) => offer.organization)).toEqual(['anual', 'anual']);
  },
);

test('an already-converted combined v2 keeps its unresolved intake flag visible in v4', () => {
  const state = calendar({
    organizationByModality: { graduacao: 'semestral', integrado: 'anual' },
    conversion: { from: 2, organization: 'classified', legacySecondSemesterIntake: true },
  });
  const converted = convertCalendarV3(state, {
    year: 2027,
    modalities: ['graduacao', 'integrado'],
  });
  expect(converted.offers[0].intake?.second).toEqual({ status: 'unknown' });
  expect(converted.offers[0].organization).toBe('semestral');
  expect(converted).not.toHaveProperty('conversion');
});

test('v4 preserves an intake requirement confirmed after the combined v2 conversion', () => {
  const legacy = {
    ...calendar({
      schemaVersion: 2,
      organizationByModality: undefined,
      secondSemesterIntake: true,
      periods: [],
    }),
    year: 2027,
    regime: 'semestral',
    modalities: ['graduacao', 'integrado'],
  };
  const v3 = convertCalendarV2(legacy);
  const confirmed = configureIntakeRequirement(v3, 'graduacao', 'second', true);
  expect(confirmed.conversion?.legacySecondSemesterIntake).toBe(true);
  expect(confirmed.intakeByModality?.graduacao.second).toEqual({ status: 'yes', required: true });
  const v4 = convertCalendarV3(confirmed, { year: 2027, modalities: legacy.modalities });
  expect(v4.offers[0].intake?.second).toEqual({ status: 'yes', required: true });
  expect(v4.offers[1].intake?.second).toEqual({ status: 'unknown' });
});

test('a confirmed negative second-intake answer is preserved despite the historical combined flag', () => {
  const state = calendar({
    conversion: { from: 2, organization: 'classified', legacySecondSemesterIntake: true },
    intakeByModality: {
      graduacao: { second: { status: 'no', required: false } },
      integrado: { second: { status: 'unknown' } },
    },
  });
  const converted = convertCalendarV3(state, {
    year: 2027,
    modalities: ['graduacao', 'integrado'],
  });
  expect(converted.offers[0].intake?.second).toEqual({ status: 'no', required: false });
  expect(converted.offers[1].intake?.second).toEqual({ status: 'unknown' });
});

test('conversion changes only offer bindings and preserves every other activity fact', () => {
  const state = calendar({
    teacherDayDate: '2027-10-15',
    teacherVacations: { firstStart: '2027-01-01', firstEnd: '2027-01-30' },
    intakeByModality: { graduacao: { annual: { status: 'yes', required: true } } },
    events: [
      {
        id: 'notice',
        name: 'Edital com comprovação anterior',
        start: '2026-12-01',
        end: '2026-12-01',
        kind: 'note',
        category: 'matricula',
        requirementId: 'admission-notice-0',
        modalities: ['graduacao'],
        recordType: 'prior-reference',
        publicationStatus: 'published',
        admission: { type: 'transfer', year: 2027, term: 'annual', periodId: 'annual' },
        deadlineAdjustment: { date: '2026-12-02', reviewed: true },
        deadlineExtensionCause: 'municipal-holiday',
        hours: 8,
      },
      { id: 'global', name: 'Evento geral', start: '2027-04-01', end: '2027-04-01', kind: 'note' },
    ],
  });
  const before = structuredClone(state);
  const converted = convertCalendarV3(state, context);
  const { modalities: _modalities, ...notice } = state.events[0];
  expect(converted.events[0]).toEqual({ ...notice, offers: ['graduacao'] });
  expect(converted.events[1]).toEqual(state.events[1]);
  expect(converted.teacherDayDate).toBe(state.teacherDayDate);
  expect(converted.teacherVacations).toEqual(state.teacherVacations);
  expect(state).toEqual(before);
  converted.offers[0].intake!.annual!.status = 'no';
  converted.events[0].admission!.year = 2040;
  converted.weekdays.pop();
  expect(state).toEqual(before);
});

test('calendar record kinds and year are authoritative and orphan keys are explicitly reportable', () => {
  const state = calendar({
    year: 2025,
    modalities: ['posgraduacao'],
    organizationByModality: { graduacao: 'anual', integrado: 'semestral' },
    assessmentStagesByModality: { graduacao: 4, subsequente: 3 },
    intakeByModality: { posgraduacao: { second: { status: 'yes', required: true } } },
    scopeConfirmation: { status: 'covered' },
  });
  expect(calendarV3OrphanKeys(state, context)).toEqual({
    organizationByModality: ['integrado'],
    assessmentStagesByModality: ['subsequente'],
    intakeByModality: ['posgraduacao'],
  });
  const converted = convertCalendarV3(state, context);
  expect(converted.offers.map((offer) => offer.id)).toEqual(['graduacao']);
  expect(converted).not.toHaveProperty('year');
  expect(converted).not.toHaveProperty('modalities');
  expect(converted).not.toHaveProperty('regime');
  expect(converted).not.toHaveProperty('secondSemesterIntake');
  expect(converted).not.toHaveProperty('assessmentStagesByModality');
  expect(converted).not.toHaveProperty('scopeConfirmation');
  expect(converted).not.toHaveProperty('organizationByModality');
  expect(converted).not.toHaveProperty('intakeByModality');
});

test('unknown kinds and invalid source formats fail instead of inventing v4 dimensions', () => {
  expect(() => convertCalendarV3(calendar(), { year: 2027, modalities: ['concomitante'] })).toThrow(
    'Tipo de oferta desconhecido',
  );
  expect(() => convertCalendarV3(calendar(), { year: 2027, modalities: [] })).toThrow('Ofertas');
  expect(() =>
    convertCalendarV3(calendar(), { year: 2027, modalities: ['graduacao', 'graduacao'] }),
  ).toThrow('Ofertas');
  expect(() => convertCalendarV3(calendar({ schemaVersion: 4 }), context)).toThrow('Formato');
});

test.each([2, 3, 4])(
  'unclassified v3 retains %i old ordinals without assigning a cycle',
  (count) => {
    const input = calendar({
      organizationByModality: { graduacao: 'a-classificar' },
      assessmentStagesByModality: { graduacao: count },
    });
    const before = structuredClone(input);
    const converted = convertCalendarV3(input, context);
    expect(converted.offers[0]).toMatchObject({
      organization: 'a-classificar',
      legacyStageCount: count,
    });
    expect(converted.offers[0]).not.toHaveProperty('stages');
    expect(converted.events[0]).toMatchObject({
      requirementId: 'stage-1:graduacao',
      start: input.events[0].start,
      end: input.events[0].end,
    });
    expect(input).toEqual(before);
  },
);
