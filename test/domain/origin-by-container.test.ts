import { expect, test } from 'vitest';
import { civilDate } from '../../src/domain/civil-date.ts';
import { automaticEventSource } from '../../src/domain/calendar/counting/core.ts';
import { evaluateCalendar } from '../../src/domain/calendar/counting/evaluation.ts';
import { prorogatedDeadline } from '../../src/domain/calendar/activities/deadlines.ts';
import {
  projectDates,
  type ActivityState,
  type CalendarEvent,
  type InstitutionalEventSnapshot,
} from '../../src/domain/calendar/model.ts';
import { reviewSupport } from '../../src/domain/reviews/technical-support.ts';
import { proensLayout } from '../../src/printing/calendar-layout.ts';

/**
 * Phase 2, step 4 (section 5.2): the origin of a date is its container. A local date whose ID
 * imitates the `inst:` prefix stays a campus date; only the institutional base is automatic.
 */
const base: InstitutionalEventSnapshot = {
  id: 'inst:holiday',
  name: 'Feriado institucional',
  start: civilDate('2027-03-10'),
  end: civilDate('2027-03-10'),
  kind: 'exclude',
  evidence: 'Resolução institucional automática',
};
// Local dates never persist `evidence` or `institutional`; the extra fields model a forged or
// stray object to prove neither the ID nor a copied flag decides the origin.
const lookalike = {
  id: 'inst:campus-holiday',
  name: 'Semana cultural do campus',
  start: civilDate('2027-03-11'),
  end: civilDate('2027-03-11'),
  kind: 'exclude',
  offers: ['integrado'],
  evidence: 'SEGREDO MANUAL',
  institutional: true,
  deadlineExtensionCause: 'municipal-holiday',
  publicationStatus: 'published',
} as CalendarEvent;

function state(): ActivityState {
  return {
    schemaVersion: 4,
    year: 2027,
    campus: 'Campus de teste',
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [
      {
        id: 'annual',
        start: civilDate('2027-03-01'),
        end: civilDate('2027-03-26'),
        association: { status: 'defined', offers: ['integrado'], term: 'annual' },
      },
    ],
    events: [lookalike],
    offers: [
      {
        id: 'integrado',
        kind: 'integrado',
        delivery: 'a-conferir',
        organization: 'anual',
        stages: { perTerm: 2 },
      },
    ],
  };
}

test('the inst: prefix alone never makes a date institutional', () => {
  expect(automaticEventSource({ id: 'inst:x', evidence: 'Fonte' } as never)).toBeUndefined();
  expect(automaticEventSource({ institutional: true, evidence: 'Fonte' })).toBe('Fonte');
});

test('the projection takes the origin from the container, whatever the ID', () => {
  const local: CalendarEvent = { ...lookalike };
  delete (local as { institutional?: boolean }).institutional;
  const [projectedBase, projectedLocal, untouched] = projectDates(
    [{ ...base, id: 'holiday-without-prefix' }],
    [lookalike, local],
  );
  expect(projectedBase).toHaveProperty('institutional', true);
  expect(projectedBase.id).toBe('holiday-without-prefix');
  expect('institutional' in projectedLocal).toBe(false);
  expect(projectedLocal.id).toBe('inst:campus-holiday');
  expect(untouched).toBe(local);
});

test('counting credits only the base date with an automatic source', () => {
  const s = state();
  const ledger = evaluateCalendar(s, projectDates([base], s.events)).byOffer.integrado.ledger;
  expect(ledger.find((day) => day.date === '2027-03-10')?.evidenceIds).toEqual([
    'Resolução institucional automática',
  ]);
  expect(ledger.find((day) => day.date === '2027-03-11')?.evidenceIds).toEqual([]);
});

test('a municipal deadline extension cites only the base date', () => {
  const s = state();
  const extended = (events: Parameters<typeof prorogatedDeadline>[2]) =>
    prorogatedDeadline(s, civilDate('2027-03-11'), events, 'integrado');
  expect(extended(projectDates([], s.events))).toMatchObject({
    date: '2027-03-12',
    source: 'municipal-extension',
    evidence: [],
  });
  expect(
    extended(
      projectDates(
        [
          {
            ...base,
            id: 'municipal',
            start: civilDate('2027-03-11'),
            end: civilDate('2027-03-11'),
            deadlineExtensionCause: 'municipal-holiday',
          },
        ],
        [],
      ),
    ),
  ).toMatchObject({ date: '2027-03-12', evidence: ['Resolução institucional automática'] });
});

test('review candidates and the PDF show no source for the local look-alike', () => {
  const s = state();
  const events = projectDates([{ ...base, name: 'Semana cultural institucional' }], s.events);
  const support = reviewSupport({ id: 'c', name: 'Calendário', version: 1, state: s }, events);
  const candidates = support.criteria.flatMap((criterion) => criterion.candidates ?? []);
  expect(candidates.find((item) => item.id === lookalike.id)?.evidence).toBe('');
  expect(candidates.find((item) => item.id === base.id)?.evidence).toBe(
    'Resolução institucional automática',
  );
  const previous = { ...lookalike, start: civilDate('2026-12-01'), end: civilDate('2026-12-01') };
  const html = proensLayout(s, projectDates([], [previous]));
  expect(html).toContain('Semana cultural do campus');
  expect(html).not.toContain('SEGREDO MANUAL');
});
