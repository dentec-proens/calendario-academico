import { expect, test } from 'vitest';
import { proensLayout } from '../../src/printing/calendar-layout.ts';
import type { CalendarActivity } from '../../src/domain/calendar/model.ts';
import { teachingDayBreakdown } from '../../src/printing/teaching-day-breakdown.ts';
import { evaluateCalendar } from '../../src/domain/calendar/counting/evaluation.ts';

const state = {
  year: 2027,
  campus: 'Campus sintético',
  periods: [],
  offers: [
    {
      id: 'integrado',
      kind: 'integrado' as const,
      delivery: 'a-conferir' as const,
      organization: 'anual' as const,
    },
  ],
};
const events: CalendarActivity[] = [
  {
    id: 'prior',
    name: 'Edital anterior <documento>',
    start: '2026-12-01',
    end: '2026-12-01',
    kind: 'note',
    offers: ['integrado'],
    publicationStatus: 'published',
    admission: { type: 'transfer', year: 2027, term: 'annual' },
  },
  {
    id: 'planned',
    name: 'Publicação a planejar',
    start: '2026-11-01',
    end: '2026-11-01',
    kind: 'note',
    offers: ['integrado'],
    recordType: 'event',
    publicationStatus: 'planned',
    admission: { type: 'regular', year: 2028, term: 'first' },
  },
  {
    id: 'cross',
    name: 'Intervalo que cruza o ano',
    start: '2026-12-15',
    end: '2027-01-12',
    kind: 'note',
    offers: ['integrado'],
  },
  {
    id: 'current',
    name: 'Processo seletivo regular',
    start: '2027-12-01',
    end: '2027-12-01',
    kind: 'note',
    offers: ['integrado'],
    publicationStatus: 'planned',
    admission: { type: 'regular', year: 2028, term: 'annual' },
  },
];

test('print keeps full dates and execution outside the annual grid without manual source labels', () => {
  const html = proensLayout(state, events, null, null, '');
  expect(html).toContain('Atividades e referências de outros anos');
  expect(html).toContain('Publicações previstas');
  expect(html).toContain('Fatos anteriores registrados');
  expect(html).toContain('01/12/2026');
  expect(html).toContain('15/12/2026 a 12/01/2027');
  expect(html).toContain('Ingresso 2028');
  expect(html).toContain('Publicação prevista');
  expect(html).not.toContain('Fonte &lt;original&gt; &amp; conferida');
  expect(html).not.toContain('Fonte a conferir');
  expect(html).not.toContain('Edital anterior <documento>');
  expect(html).not.toContain('<h3>dezembro 2026</h3>');
});

test('an empty calendar has no fabricated historical section or execution certification', () => {
  const html = proensLayout(state, [], null, null, '');
  expect(html).not.toContain('Atividades e referências de outros anos');
  expect(html).toContain('Sem aprovação oficial');
  expect(proensLayout(state, [], null, { purpose: 'test' }, '')).not.toContain('undefined');
});

test('print distributions use the semantic semester of each offer despite coincident annual periods', () => {
  const input = {
    ...state,
    schemaVersion: 4 as const,
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [
      {
        id: 'annual',
        name: 'Ano integrado',
        start: '2027-02-01',
        end: '2027-12-17',
        association: { status: 'defined' as const, offers: ['integrado'], term: 'annual' as const },
      },
      {
        id: 'second',
        name: 'Segundo semestre graduação',
        start: '2027-08-02',
        end: '2027-12-17',
        association: { status: 'defined' as const, offers: ['graduacao'], term: 'second' as const },
      },
      {
        id: 'first',
        name: 'Primeiro semestre graduação',
        start: '2027-02-01',
        end: '2027-06-30',
        association: { status: 'defined' as const, offers: ['graduacao'], term: 'first' as const },
      },
    ],
    offers: [
      {
        id: 'integrado',
        kind: 'integrado' as const,
        delivery: 'a-conferir' as const,
        organization: 'anual' as const as 'anual' | 'semestral' | 'a-classificar',
      },
      {
        id: 'graduacao',
        kind: 'graduacao' as const,
        delivery: 'a-conferir' as const,
        organization: 'semestral' as const as 'anual' | 'semestral' | 'a-classificar',
      },
    ],
  };
  const result = evaluateCalendar(input, []);
  const degree = teachingDayBreakdown(input, [], result, 'graduacao');
  expect(degree.semesters.map((row) => [row.start, row.end])).toEqual([
    ['2027-02-01', '2027-06-30'],
    ['2027-08-02', '2027-12-17'],
  ]);
  const html = proensLayout(input, [], result, null, '');
  expect(html).not.toContain('undefined');
  expect(html).toContain('Ano integrado');
});
