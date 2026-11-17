import { civilDate } from '../../src/domain/civil-date.ts';
import { expect, test } from 'vitest';
import { countCalendar } from '../../src/domain/calendar/counting/core.ts';
import { evaluateCalendar } from '../../src/domain/calendar/counting/evaluation.ts';
import { applicabilityFor } from '../../src/domain/policies/registry.ts';
import { activityPlan } from '../../src/domain/calendar/activities/plan.ts';
import {
  projectDates,
  type ActivityState,
  type CalendarEvent,
  type CalendarOffer,
  type InstitutionalEventSnapshot,
} from '../../src/domain/calendar/model.ts';

// External metadata is test input, never a storage/API contract.
type AnnotatedEvent = CalendarEvent & { evidence?: string };
type AnnotatedState = Omit<ActivityState, 'events' | 'offers'> & {
  events: AnnotatedEvent[];
  weekEvidence?: string;
  offers: (Omit<CalendarOffer, 'scope'> & {
    scope?: CalendarOffer['scope'] & { source?: string };
  })[];
};
import { proensLayout } from '../../src/printing/calendar-layout.ts';

function state(): AnnotatedState {
  return {
    schemaVersion: 7 as const,
    year: 2027,
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    weekEvidence: 'Ata manual da semana',
    periods: [
      {
        id: 'annual',
        name: 'Anual',
        start: civilDate('2027-03-01'),
        end: civilDate('2027-03-26'),
        association: { status: 'defined', offers: ['integrado'], term: 'annual' },
      },
      {
        id: 'first',
        name: 'Primeiro',
        start: civilDate('2027-03-01'),
        end: civilDate('2027-03-12'),
        association: { status: 'defined', offers: ['graduacao'], term: 'first' },
      },
      {
        id: 'second',
        name: 'Segundo',
        start: civilDate('2027-03-15'),
        end: civilDate('2027-03-26'),
        association: { status: 'defined', offers: ['graduacao'], term: 'second' },
      },
    ],
    events: [
      {
        id: 'saturday',
        name: 'Sábado',
        start: civilDate('2027-03-06'),
        end: civilDate('2027-03-06'),
        effect: 'include' as const,
        offers: ['integrado', 'graduacao'],
        evidence: 'Ata manual do sábado',
      },
      {
        id: 'overlap',
        name: 'Reposição',
        start: civilDate('2027-03-08'),
        end: civilDate('2027-03-08'),
        effect: 'include' as const,
        offers: ['integrado', 'graduacao'],
        evidence: 'Fonte manual da reposição',
      },
      {
        id: 'local',
        name: 'Feriado local',
        start: civilDate('2027-03-08'),
        end: civilDate('2027-03-08'),
        effect: 'exclude' as const,
        offers: ['integrado'],
        evidence: 'Fonte manual do feriado',
      },
    ],
    offers: [
      {
        id: 'integrado',
        kind: 'integrado' as const,
        delivery: 'a-conferir' as const,
        organization: 'anual' as const,
        stages: { status: 'defined' as const, perTerm: 2 },
        scope: { status: 'covered', source: 'Referência manual de escopo' },
      },
      {
        id: 'graduacao',
        kind: 'graduacao' as const,
        delivery: 'a-conferir' as const,
        organization: 'semestral' as const,
        stages: { status: 'defined' as const, perTerm: 1 },
        scope: { status: 'covered', source: 'Referência manual de escopo' },
      },
    ],
  };
}

/** Institutional base date: automatic because of its container, not its ID. */
const baseHoliday: InstitutionalEventSnapshot = {
  id: 'inst:holiday',
  name: 'Feriado institucional',
  start: civilDate('2027-03-10'),
  end: civilDate('2027-03-10'),
  effect: 'exclude' as const,
  evidence: 'Resolução institucional automática',
  offers: ['integrado', 'graduacao'],
};

function removeManualSources(input: AnnotatedState): AnnotatedState {
  const result = structuredClone(input);
  delete result.weekEvidence;
  for (const offer of result.offers) if (offer.scope) delete offer.scope.source;
  for (const event of result.events) {
    delete event.evidence;
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
  const before = evaluateCalendar(original, projectDates([baseHoliday], original.events));
  expect(before.byOffer.integrado.total).toBe(19);
  expect(before.byOffer.graduacao.total).toBe(20);
  expect(before.byOffer.graduacao.byPeriod).toEqual({ first: 10, second: 10 });
  const stripped = removeManualSources(original);
  const after = evaluateCalendar(stripped, projectDates([baseHoliday], stripped.events));
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
        start: civilDate('2027-03-01'),
        end: civilDate('2027-03-05'),
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

test('local registration keeps its explicit required and optional choices without sources', () => {
  const original = state();
  original.offers.find((offer) => offer.id === 'graduacao')!.intake = { first: true };
  const stripped = removeManualSources(original);
  const rows = activityPlan(original).filter(
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

test('PDF omits manual source text but keeps automatic institutional references and full dates', () => {
  const original = state();
  original.offers.forEach((offer) => {
    offer.scope = { status: 'own-regulation', source: 'SEGREDO MANUAL DE ESCOPO' };
  });
  const events = [
    {
      id: 'manual',
      name: 'Edital anterior',
      start: civilDate('2026-12-01'),
      end: civilDate('2026-12-02'),
      effect: 'note' as const,
      evidence: 'SEGREDO MANUAL DO EVENTO',
      notice: {
        publication: 'published' as const,
        admission: {
          type: 'regular' as const,
          year: 2027,
          term: 'annual' as const,
          destinations: [],
        },
      },
      offers: ['integrado'],
    },
    {
      id: 'inst:previous',
      institutional: true,
      name: 'Edital institucional',
      start: civilDate('2026-11-01'),
      end: civilDate('2026-11-02'),
      evidence: 'REFERÊNCIA INSTITUCIONAL AUTOMÁTICA',
      offers: ['integrado'],
    },
  ];
  const html = proensLayout(original, events);
  expect(html).not.toContain('SEGREDO MANUAL');
  expect(html).not.toContain('Fonte a conferir');
  expect(html).toContain('REFERÊNCIA INSTITUCIONAL AUTOMÁTICA');
  expect(html).toContain('01/12/2026');
  expect(html).not.toContain('Fonte da política');
  expect(html).not.toContain('norma própria');
});

test('own-regulation status preserves unconfigured minimums after removing its manual reference', () => {
  const original = state();
  original.offers.forEach((offer) => {
    offer.scope = { status: 'own-regulation', source: 'Norma local manual' };
  });
  const stripped = removeManualSources(original);
  const before = evaluateCalendar(original, projectDates([baseHoliday], original.events));
  const after = evaluateCalendar(stripped, projectDates([baseHoliday], stripped.events));
  expect(numericResult(after)).toEqual(numericResult(before));
  expect(after.byOffer.integrado.checks.every((check) => check.status === 'NOT_VERIFIABLE')).toBe(
    true,
  );
});
