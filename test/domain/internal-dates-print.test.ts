import { expect, test } from 'vitest';
import { civilDate } from '../../src/domain/civil-date.ts';
import { createCampusDate, type DateInput } from '../../src/domain/calendar/commands/events.ts';
import { projectDates } from '../../src/domain/calendar/model.ts';
import { evaluateCalendar } from '../../src/domain/calendar/counting/evaluation.ts';
import {
  completeVersionNote,
  hasInternalDates,
  printsAsInternal,
  proensLayout,
} from '../../src/printing/calendar-layout.ts';
import { ivaiporaAnnual, type PendingLinksFixture } from '../fixtures/pending-links-2027.ts';

/**
 * Official and complete print (art. 18): the official version leaves every internal date out of the
 * grid and the lists, the complete one marks them, and both print the same count of school days.
 */
type State = PendingLinksFixture;

const internalDates: DateInput<State>[] = [
  {
    id: 'campus-rehearsal',
    name: 'Ensaio interno da banda',
    start: civilDate('2027-03-10'),
    end: civilDate('2027-03-11'),
    effect: 'note',
    category: 'evento',
    scope: { offers: ['integrado'], confirmed: true },
    internal: true,
  },
  // A note without category is `institucional`, an allowed effective category.
  {
    id: 'campus-meeting',
    name: 'Reunião interna da direção',
    start: civilDate('2027-08-02'),
    end: civilDate('2027-08-02'),
    effect: 'note',
    scope: { offers: ['integrado', 'subsequente'], confirmed: true },
    internal: true,
  },
  // Before the year: printed among the references of other years only in the complete version.
  {
    id: 'campus-planning',
    name: 'Planejamento interno anterior',
    start: civilDate('2026-12-07'),
    end: civilDate('2026-12-07'),
    effect: 'note',
    category: 'prazo',
    scope: { offers: ['integrado'], confirmed: true },
    internal: true,
  },
];

function calendar() {
  let state = ivaiporaAnnual();
  for (const date of internalDates) state = createCampusDate(state, date, []);
  const events = projectDates([], state.events);
  return { state, events };
}

const print = (version?: 'official' | 'complete') => {
  const { state, events } = calendar();
  return proensLayout(state, events, evaluateCalendar(state, events), null, '', version);
};

/** The section of one month: its grid and its list of dates. */
const month = (html: string, name: string) => {
  const start = html.indexOf(`<h3>${name}</h3>`);
  return html.slice(start, html.indexOf('</section>', start));
};
const day = (section: string, n: number) =>
  section.match(
    new RegExp(
      `<td class="[^"]*" title="[^"]*">${n}(?:<b class="day-mark">·</b>)?(?:<i [^>]*></i>)*</td>`,
    ),
  )![0];

/** Every printed count: monthly totals, the totals by offer and by period, the distribution. */
const counts = (html: string) => ({
  monthly: [...html.matchAll(/<p class="monthly-total">([^<]*)<\/p>/g)].map((m) => m[1]),
  summary: html.slice(html.indexOf('<section class="proens-summary">')),
});

test('both versions print the same count of school days, which internal dates never change', () => {
  const { state, events } = calendar();
  const official = events.filter((event) => !printsAsInternal(event));
  expect(events.length - official.length).toBe(internalDates.length);
  const all = evaluateCalendar(state, events);
  expect(evaluateCalendar(state, official)).toEqual(all);
  const before = counts(print());
  expect(before.monthly).toHaveLength(12);
  expect(before.monthly.some((total) => total !== '0 dias letivos')).toBe(true);
  const complete = counts(print('complete'));
  expect(complete.monthly).toEqual(before.monthly);
  // The summary differs only by the key: the entry of internal dates and the categories the
  // internal dates add to the grid.
  const withoutKey = (summary: string) =>
    summary.replace(/<div class="proens-key">.*?<\/div><p>/u, '<p>');
  expect(withoutKey(complete.summary)).toBe(withoutKey(before.summary));
  expect(complete.summary).toContain(
    '<div><span class="swatch internal-swatch"></span>Data interna</div>',
  );
  expect(before.summary).not.toContain('internal-swatch');
});

test('the official version, the default, prints no internal date in the grid or in the lists', () => {
  const html = print();
  expect(print('official')).toBe(html);
  for (const { name } of internalDates) expect(html).not.toContain(name);
  expect(html).not.toContain('Data interna');
  expect(html).not.toContain('internal');
  expect(html).not.toContain(completeVersionNote);
  // The grid cell of an internal date has no title, color or mark of its own.
  const march = month(html, 'março');
  expect(day(march, 10)).not.toContain('Ensaio');
  expect(day(march, 10)).toBe(
    '<td class="" title="1ª etapa de avaliação — Técnico integrado; 1ª etapa de avaliação — Técnico subsequente">10<b class="day-mark">·</b></td>',
  );
});

test('the official version prints byte for byte what a calendar without those dates prints', () => {
  const { state } = calendar();
  const without = { ...state, events: state.events.filter((event) => !event.internal) };
  const events = projectDates([], without.events);
  expect(print()).toBe(proensLayout(without, events, evaluateCalendar(without, events), null, ''));
});

test('the complete version marks internal dates, with its legend and heading', () => {
  const html = print('complete');
  expect(html).toContain('data-print-version="complete"');
  expect(html).toContain(
    '<small class="proens-version-mark">Versão completa: inclui datas de organização interna (art. 18); não substitui o calendário oficial</small>',
  );
  expect(html).toContain('<span class="swatch internal-swatch"></span>Data interna</div>');
  for (const { name } of internalDates)
    expect(html).toContain(`${name}<small class="internal-date-label">Data interna</small>`);
  // Two rows in the month lists (March and August) and one among the references of other years.
  expect(html.match(/<tr class="internal-date">/g)).toHaveLength(2);
  expect(html.match(/class="internal-date-label"/g)).toHaveLength(3);
  // Days 10 and 11 of March and day 2 of August carry the mark in the grid, with their category.
  expect(html.match(/class="internal-day-mark"/g)).toHaveLength(3);
  const march = month(html, 'março');
  for (const n of [10, 11]) {
    expect(day(march, n)).toContain('class="cat-evento"');
    expect(day(march, n)).toContain('; Ensaio interno da banda"');
    expect(day(march, n)).toContain('<i class="internal-day-mark" aria-label="Data interna"></i>');
  }
  expect(day(march, 12)).not.toContain('internal-day-mark');
});

test('coinciding annual and semester dates stay distinct in both versions', () => {
  const { state } = calendar();
  const pairs = [
    ['ivaipora-final-2', 'ivaipora-annual-final'],
    ['ivaipora-diary-2', 'ivaipora-annual-diary'],
    ['ivaipora-registration-1', 'ivaipora-annual-registration'],
    ['ivaipora-recognition-1', 'ivaipora-annual-recognition'],
    ['ivaipora-final-appeal-2', 'ivaipora-annual-final-appeal'],
  ];
  for (const html of [print(), print('complete')])
    for (const ids of pairs) {
      const [semester, annual] = ids.map((id) => state.events.find((event) => event.id === id)!);
      expect(semester.name).not.toBe(annual.name);
      // Both reach every offer of the calendar, so neither prints a list of offers.
      expect(html, semester.id).toContain(`<td>${semester.name}</td>`);
      expect(html, annual.id).toContain(`<td>${annual.name}</td>`);
    }
});

test('only an eligible date marked internal is left out of the official version', () => {
  const { events } = calendar();
  expect(hasInternalDates(events)).toBe(true);
  expect(hasInternalDates(events.filter((event) => !printsAsInternal(event)))).toBe(false);
  // A mark the save boundary refuses (effect on the count) keeps the date official.
  const holiday = {
    ...events.find((event) => event.id === 'campus-rehearsal')!,
    effect: 'exclude' as const,
  };
  expect(printsAsInternal(holiday)).toBe(false);
});
