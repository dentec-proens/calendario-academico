import { expect, test } from 'vitest';
import { countCalendar } from '../../src/domain/calendar/counting/core.ts';
import { evaluateCalendar } from '../../src/domain/calendar/counting/evaluation.ts';
import { activityCoverage } from '../../src/domain/calendar/activities/coverage.ts';
import { applicabilityFor } from '../../src/domain/policies/registry.ts';
import { prorogatedDeadline } from '../../src/domain/calendar/activities/deadlines.ts';
import { validateActivityRecord } from '../../src/domain/calendar/activities/validation.ts';
import { activityChecklist } from '../../src/domain/calendar/activities/checklist.ts';
import type {
  ActivityState,
  CalendarActivity,
  CalendarOffer,
  IntakeConfiguration,
} from '../../src/domain/calendar/model.ts';

// External metadata is test input, never a storage/API contract.
type AnnotatedEvent = CalendarActivity & {
  evidence?: string;
  deadlineAdjustment?: CalendarActivity['deadlineAdjustment'] & { evidence?: string };
};
type AnnotatedState = Omit<ActivityState, 'events' | 'offers'> & {
  events: AnnotatedEvent[];
  weekEvidence?: string;
  offers: (Omit<CalendarOffer, 'scope' | 'intake'> & {
    scope?: CalendarOffer['scope'] & { source?: string };
    intake?: Partial<
      Record<'annual' | 'first' | 'second', IntakeConfiguration & { source?: string }>
    >;
  })[];
};
import { proensLayout } from '../../src/printing/calendar-layout.ts';

function state(): AnnotatedState {
  return {
    schemaVersion: 4 as const,
    year: 2027,
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    weekEvidence: 'Ata manual da semana',
    periods: [
      {
        id: 'annual',
        name: 'Anual',
        start: '2027-03-01',
        end: '2027-03-26',
        association: { status: 'defined', offers: ['integrado'], term: 'annual' },
      },
      {
        id: 'first',
        name: 'Primeiro',
        start: '2027-03-01',
        end: '2027-03-12',
        association: { status: 'defined', offers: ['graduacao'], term: 'first' },
      },
      {
        id: 'second',
        name: 'Segundo',
        start: '2027-03-15',
        end: '2027-03-26',
        association: { status: 'defined', offers: ['graduacao'], term: 'second' },
      },
    ],
    events: [
      {
        id: 'saturday',
        name: 'Sábado',
        start: '2027-03-06',
        end: '2027-03-06',
        kind: 'include',
        evidence: 'Ata manual do sábado',
      },
      {
        id: 'overlap',
        name: 'Reposição',
        start: '2027-03-08',
        end: '2027-03-08',
        kind: 'include',
        evidence: 'Fonte manual da reposição',
      },
      {
        id: 'local',
        name: 'Feriado local',
        start: '2027-03-08',
        end: '2027-03-08',
        kind: 'exclude',
        offers: ['integrado'],
        evidence: 'Fonte manual do feriado',
      },
      {
        id: 'inst:holiday',
        name: 'Feriado institucional',
        start: '2027-03-10',
        end: '2027-03-10',
        kind: 'exclude',
        evidence: 'Resolução institucional automática',
      },
    ],
    offers: [
      {
        id: 'integrado',
        kind: 'integrado' as const,
        delivery: 'a-conferir' as const,
        organization: 'anual' as const,
        stages: { perTerm: 2 },
        scope: { status: 'covered', source: 'Referência manual de escopo' },
      },
      {
        id: 'graduacao',
        kind: 'graduacao' as const,
        delivery: 'a-conferir' as const,
        organization: 'semestral' as const,
        stages: { perTerm: 1 },
        scope: { status: 'covered', source: 'Referência manual de escopo' },
      },
    ],
  };
}

function removeManualSources(input: AnnotatedState): AnnotatedState {
  const result = structuredClone(input);
  delete result.weekEvidence;
  for (const offer of result.offers) {
    if (offer.scope) delete offer.scope.source;
    for (const entry of Object.values(offer.intake ?? {})) delete entry.source;
  }
  for (const event of result.events) {
    if (!event.id.startsWith('inst:')) delete event.evidence;
    if (event.deadlineAdjustment)
      delete (event.deadlineAdjustment as { evidence?: string }).evidence;
  }
  return result;
}

function numericResult(result: ReturnType<typeof evaluateCalendar>) {
  return Object.fromEntries(
    Object.entries(result.byOffer).map(([modality, row]) => [
      modality,
      {
        total: row.total,
        byPeriod: row.byPeriod,
        byWeekday: row.byWeekday,
        ledger: row.ledger.map(({ evidenceIds: _sources, ...day }) => day),
        conflicts: row.conflicts,
        checks: row.checks,
      },
    ]),
  );
}

test('removing every manual source preserves annual, semester and per-offer day counts and conflicts', () => {
  const original = state();
  const before = evaluateCalendar(original, original.events);
  expect(before.byOffer.integrado.total).toBe(19);
  expect(before.byOffer.graduacao.total).toBe(20);
  expect(before.byOffer.graduacao.byPeriod).toEqual({ first: 10, second: 10 });
  const stripped = removeManualSources(original);
  const after = evaluateCalendar(stripped, stripped.events);
  expect(numericResult(after)).toEqual(numericResult(before));
  expect(
    after.byOffer.integrado.ledger.find((day) => day.date === '2027-03-10')?.evidenceIds,
  ).toEqual(['Resolução institucional automática']);
  expect(after.byOffer.integrado.ledger.flatMap((day) => day.evidenceIds)).not.toContain(
    'Ata manual da semana',
  );
});

test('the counting core requires applied confirmation, not a textual source', () => {
  const input = {
    year: 2027,
    offerId: 'integrado',
    periods: [
      {
        id: 'one',
        start: '2027-03-01',
        end: '2027-03-05',
        association: { status: 'defined' as const, offers: ['graduacao'], term: 'first' as const },
      },
    ],
    weekPattern: { weekdays: [1, 2, 3, 4, 5], confirmed: true },
    inclusions: [],
    exclusions: [],
    thresholds: { annual: null, byPeriod: { one: null } },
  };
  expect(countCalendar(input).total).toBe(5);
  expect(countCalendar(input).ledger.every((day) => day.evidenceIds.length === 0)).toBe(true);
  expect(() =>
    countCalendar({ ...input, weekPattern: { ...input.weekPattern, confirmed: false } }),
  ).toThrow(/não confirmada/);
});

function deadlineState(): ActivityState {
  return {
    ...state(),
    periods: [
      {
        id: 'one',
        start: '2027-08-01',
        end: '2027-09-30',
        association: { status: 'defined', offers: ['integrado', 'graduacao'], term: 'annual' },
      },
    ],
    events: [],
    offers: state().offers.map((offer) => ({
      ...offer,
      organization: ({ integrado: 'anual', graduacao: 'anual' }[offer.id] ?? 'a-classificar') as
        'anual' | 'semestral' | 'a-classificar',
    })),
  };
}
const holiday = (overrides: Partial<AnnotatedEvent> = {}): AnnotatedEvent => ({
  id: 'municipal',
  name: 'Feriado municipal',
  start: '2027-08-31',
  end: '2027-08-31',
  kind: 'exclude',
  offers: ['integrado'],
  evidence: 'Lei manual',
  deadlineExtensionCause: 'municipal-holiday',
  ...overrides,
});

for (const scenario of [
  {
    name: 'single municipal holiday',
    events: [holiday()],
    expected: '2027-09-01',
    source: 'municipal-extension',
  },
  {
    name: 'municipal recess and a weekend',
    events: [holiday({ end: '2027-09-03', deadlineExtensionCause: 'municipal-recess' })],
    expected: '2027-09-06',
    source: 'municipal-extension',
  },
  {
    name: 'an explicitly included Saturday',
    events: [
      holiday({ end: '2027-09-03' }),
      {
        ...holiday(),
        id: 'saturday',
        start: '2027-09-04',
        end: '2027-09-04',
        kind: 'include',
        deadlineExtensionCause: undefined,
      },
    ],
    expected: '2027-09-04',
    source: 'municipal-extension',
  },
  {
    name: 'an ordinary exclusion',
    events: [holiday({ deadlineExtensionCause: undefined })],
    expected: '2027-08-31',
    source: 'norm',
  },
  {
    name: 'a municipal holiday belonging to another offer',
    events: [holiday({ offers: ['graduacao'] })],
    expected: '2027-08-31',
    source: 'norm',
  },
])
  test(`deadline is unchanged without manual sources: ${scenario.name}`, () => {
    const original = { ...deadlineState(), events: scenario.events };
    const stripped = removeManualSources(original);
    const before = prorogatedDeadline(original, '2027-08-31', original.events, 'integrado');
    const after = prorogatedDeadline(stripped, '2027-08-31', stripped.events, 'integrado');
    expect(before).toMatchObject({ date: scenario.expected, source: scenario.source });
    expect(after).toMatchObject({
      date: before.date,
      original: before.original,
      source: before.source,
    });
    for (const event of stripped.events)
      expect(() => validateActivityRecord(stripped, event)).not.toThrow();
  });

test('local registration keeps its explicit required and optional choices without sources', () => {
  const original = state();
  original.offers.find((offer) => offer.id === 'graduacao')!.intake = {
    first: { status: 'yes', required: true, source: 'Regra manual' },
    second: { status: 'no', required: false, source: 'Ata manual' },
  };
  const stripped = removeManualSources(original);
  const rows = activityChecklist(original).filter(
    (row) => row.id.startsWith('registration-') && row.modalities?.includes('graduacao'),
  );
  expect(rows).toHaveLength(2);
  expect(rows.map((row) => applicabilityFor(original, row, 'graduacao'))).toEqual([
    'required',
    'optional',
  ]);
  expect(rows.map((row) => applicabilityFor(stripped, row, 'graduacao'))).toEqual(
    rows.map((row) => applicabilityFor(original, row, 'graduacao')),
  );
});

test('an exceptional regular notice deadline keeps its date even with reviewed false and no source', () => {
  const original = {
    ...deadlineState(),
    offers: [
      {
        id: 'integrado',
        kind: 'integrado' as const,
        delivery: 'a-conferir' as const,
        organization: 'anual' as const,
        stages: { perTerm: 2 },
      },
    ],
  };
  const row = activityChecklist(original).find((item) => item.admissionType === 'regular')!;
  expect(row.deadline).toBeTruthy();
  const event: AnnotatedEvent = {
    id: 'notice',
    name: row.name,
    requirementId: row.id,
    kind: 'note',
    offers: ['integrado'],
    start: '2027-12-01',
    end: '2027-12-01',
    evidence: 'Publicação manual',
    admission: { type: 'regular', year: 2028, term: 'annual' },
    publicationStatus: 'planned',
    deadlineAdjustment: { date: '2027-12-03', evidence: 'Cronograma manual', reviewed: false },
  };
  original.events = [event];
  const stripped = removeManualSources(original);
  expect(() => validateActivityRecord(stripped, stripped.events[0])).not.toThrow();
  const before = activityCoverage(original).find(
    (item) => item.requirement.id === row.id && item.offerId === 'integrado',
  )!;
  const after = activityCoverage(stripped).find(
    (item) => item.requirement.id === row.id && item.offerId === 'integrado',
  )!;
  expect(before.coverage).toBe('complete');
  expect(after.coverage).toBe(before.coverage);
  expect(after.execution).toBe(before.execution);
  expect(stripped.events[0].deadlineAdjustment?.reviewed).toBe(false);
  stripped.events[0].end = '2027-12-04';
  expect(
    activityCoverage(stripped).find(
      (item) => item.requirement.id === row.id && item.offerId === 'integrado',
    )?.coverage,
  ).toBe('partial');
});

test('PDF omits manual source text but keeps automatic institutional references and full dates', () => {
  const original = state();
  original.offers.forEach((offer) => {
    offer.scope = { status: 'own-regulation', source: 'SEGREDO MANUAL DE ESCOPO' };
  });
  const events = [
    {
      id: 'manual',
      name: 'Edital anterior',
      start: '2026-12-01',
      end: '2026-12-02',
      kind: 'note',
      recordType: 'prior-reference' as const,
      evidence: 'SEGREDO MANUAL DO EVENTO',
      publicationStatus: 'published' as const,
      admission: { type: 'regular' as const, year: 2027, term: 'annual' as const },
      deadlineAdjustment: {
        date: '2027-09-03',
        evidence: 'SEGREDO MANUAL DO AJUSTE',
        reviewed: false,
      },
    },
    {
      id: 'inst:previous',
      institutional: true,
      name: 'Edital institucional',
      start: '2026-11-01',
      end: '2026-11-02',
      evidence: 'REFERÊNCIA INSTITUCIONAL AUTOMÁTICA',
      recordType: 'prior-reference' as const,
    },
  ];
  const html = proensLayout(original, events);
  expect(html).not.toContain('SEGREDO MANUAL');
  expect(html).not.toContain('Fonte a conferir');
  expect(html).toContain('REFERÊNCIA INSTITUCIONAL AUTOMÁTICA');
  expect(html).toContain('01/12/2026');
  expect(html).toContain('Fonte da política');
  expect(html).toContain('norma própria');
});

test('own-regulation status preserves unconfigured minimums after removing its manual reference', () => {
  const original = state();
  original.offers.forEach((offer) => {
    offer.scope = { status: 'own-regulation', source: 'Norma local manual' };
  });
  const stripped = removeManualSources(original);
  const before = evaluateCalendar(original, original.events);
  const after = evaluateCalendar(stripped, stripped.events);
  expect(numericResult(after)).toEqual(numericResult(before));
  expect(after.byOffer.integrado.checks.every((check) => check.status === 'NOT_VERIFIABLE')).toBe(
    true,
  );
});

test('municipal deadline preserves automatic institutional references while absent next teaching dates stay unresolved', () => {
  const input = deadlineState();
  const automatic = holiday({
    id: 'inst:municipal',
    evidence: 'Registro institucional automático',
  });
  expect(prorogatedDeadline(input, '2027-08-31', [automatic], 'integrado')).toMatchObject({
    date: '2027-09-01',
    evidence: ['Registro institucional automático'],
  });
  const stripped = {
    ...removeManualSources({ ...input, events: [holiday()] }),
    weekConfirmed: false,
  };
  expect(prorogatedDeadline(stripped, '2027-08-31', stripped.events, 'integrado')).toMatchObject({
    date: null,
    source: 'municipal-extension',
  });
  const endOfPeriod = {
    ...stripped,
    weekConfirmed: true,
    periods: input.periods.map((period) => ({ ...period, end: '2027-08-31' })),
  };
  expect(prorogatedDeadline(endOfPeriod, '2027-08-31', stripped.events, 'integrado')).toMatchObject(
    { date: null, source: 'municipal-extension' },
  );
});
