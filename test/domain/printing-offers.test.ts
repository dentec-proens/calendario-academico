import { civilDate } from '../../src/domain/civil-date.ts';
import { expect, test } from 'vitest';
import { rowLink } from '../helpers/activity-links.ts';
import { calendarOffersFixture } from '../fixtures/calendar-offers.ts';
import { proensLayout } from '../../src/printing/calendar-layout.ts';
import { teachingDayBreakdown } from '../../src/printing/teaching-day-breakdown.ts';
import { reviewDocument } from '../../src/printing/review-export.ts';
import { evaluateCalendar } from '../../src/domain/calendar/counting/evaluation.ts';

test('calendar print identifies each offer in the header, periods, event scopes and teaching totals', () => {
  const state = calendarOffersFixture();
  const day = civilDate(`${state.year}-04-07`);
  // A date of one offer lists it; a stage, whose description ends with the offer, does not repeat it.
  const events = [
    ...state.events,
    ...state.offers.map((offer, index) => ({
      id: `meeting-${offer.id}`,
      name: `Reunião ${index + 1} da oferta`,
      start: day,
      end: day,
      effect: 'note' as const,
      offers: [offer.id],
    })),
  ];
  const result = evaluateCalendar(state, events);
  const html = proensLayout(state, events, result, null, '');
  for (const [index, label] of [
    'Técnico integrado',
    'Licenciatura em Química',
    'Engenharia Elétrica',
    'Tecnologia em Análise de Sistemas',
  ].entries()) {
    expect(html).toContain(label);
    expect(html).toContain(`Dias letivos — ${label}`);
    expect(html).toContain(`Reunião ${index + 1} da oferta [${label}]`);
    expect(html).toContain(`— ${label}</td>`);
    expect(html).not.toContain(`— ${label} [${label}]`);
  }
  expect(html).toContain('<th>Oferta</th>');
  expect(html).not.toContain('undefined');
  expect(html).not.toContain('[graduacao-2]');
  expect(html).not.toContain('[graduacao-3]');
});

test('semester distributions group stages by cycle and restart displayed numbering without changing bindings', () => {
  const state = calendarOffersFixture();
  const before = structuredClone(state);
  const result = evaluateCalendar(state, state.events);
  const report = teachingDayBreakdown(state, state.events, result, 'graduacao-2');
  expect(
    report.stageGroups.map((group) => [group.term, group.rows.map((row) => row.label)]),
  ).toEqual([
    ['first', ['1ª etapa — 1º semestre', '2ª etapa — 1º semestre']],
    ['second', ['1ª etapa — 2º semestre', '2ª etapa — 2º semestre']],
  ]);
  const one = teachingDayBreakdown(state, state.events, result, 'graduacao-3');
  expect(one.stageGroups.map((group) => group.rows.map((row) => row.label))).toEqual([
    ['1ª etapa — 1º semestre'],
    ['1ª etapa — 2º semestre'],
  ]);
  expect(report.semesters.map((row) => [row.start, row.end])).toEqual([
    ['2027-02-01', '2027-07-09'],
    ['2027-07-26', '2027-12-17'],
  ]);
  expect(state).toEqual(before);
  expect(
    state.events
      .filter((event) => event.offers.includes('graduacao-2'))
      .map((event) => event.activity),
  ).toEqual([1, 2, 3, 4].map((n) => rowLink(state, `stage-${n}:graduacao-2`)));
});

test('annual distributions retain the stage cycle and all displayed totals come from their own ledgers', () => {
  const state = calendarOffersFixture();
  const result = evaluateCalendar(state, state.events);
  const annual = teachingDayBreakdown(state, state.events, result, 'graduacao');
  expect(annual.showSemesters).toBe(false);
  expect(
    annual.stageGroups.map((group) => [group.term, group.rows.map((row) => row.label)]),
  ).toEqual([
    ['annual', ['1ª etapa — trimestral', '2ª etapa — trimestral', '3ª etapa — trimestral']],
  ]);
  for (const offer of state.offers) {
    const report = teachingDayBreakdown(state, state.events, result, offer.id);
    expect(report.annual.total).toBe(result.byOffer[offer.id].total);
    expect(report.months.reduce((total, row) => total + (row.total ?? 0), 0)).toBe(
      result.byOffer[offer.id].total,
    );
    expect(report.notes).not.toContain(
      'Preencha os intervalos dos semestres letivos para completar a distribuição semestral.',
    );
  }
});

test('a migrated stage outside its own cycle prints its dates and warns without changing actual teaching-day counts', () => {
  const state = calendarOffersFixture();
  const expected = evaluateCalendar(state, state.events).byOffer['graduacao-2'].total;
  const stage = state.events.find((event) => event.id === 'graduacao-2-stage-3')!;
  stage.start = civilDate('2027-02-01');
  stage.end = civilDate('2027-04-16');
  const result = evaluateCalendar(state, state.events);
  const report = teachingDayBreakdown(state, state.events, result, 'graduacao-2');
  expect(report.annual.total).toBe(expected);
  expect(report.stages[2]).toMatchObject({
    available: false,
    total: null,
    start: civilDate('2027-02-01'),
    end: civilDate('2027-04-16'),
  });
  expect(
    report.notes.some(
      (note) => note.includes('1ª etapa — 2º semestre') && note.includes('seu ciclo'),
    ),
  ).toBe(true);
  const html = proensLayout(state, state.events, result, null, '');
  expect(html).toContain('01/02 a 16/04');
  expect(html).toContain('seu ciclo');
  expect(stage.activity).toEqual(rowLink(state, 'stage-3:graduacao-2'));
});

test('calendar print keeps only the concise status and the title year, leaving policy details to review', () => {
  const state = calendarOffersFixture();
  const html = proensLayout(state, state.events, evaluateCalendar(state, state.events), {
    status: 'rascunho',
    version: 15,
    currentCatalogueRevision: 2,
  });
  expect(html).toContain(
    'CAMPUS ' +
      state.campus +
      '</h2><small class="proens-status-mark" data-status="rascunho">Rascunho — sem validade</small>',
  );
  expect(html.match(/2027/g)).toHaveLength(1);
  expect(html).toContain('CALENDÁRIO ACADÊMICO E ADMINISTRATIVO 2027');
  for (const text of [
    'Conjunto de regras',
    'Fonte da política',
    'Período do ano letivo',
    'escopo a conferir',
    'Proposta preliminar',
    'Versão 15',
    'Base institucional',
    'Sem aprovação oficial',
    '<p></p>',
  ])
    expect(html).not.toContain(text);
});

test('print and review exports escape offer labels in HTML and preserve human text in the text export', () => {
  const state = calendarOffersFixture();
  state.offers[2].label = 'Engenharia <Elétrica> & Sistemas';
  const html = proensLayout(state, state.events, null, null, '');
  expect(html).toContain('Engenharia &lt;Elétrica&gt; &amp; Sistemas');
  expect(html).not.toContain('Engenharia <Elétrica>');
  const doc = reviewDocument(
    { state, courses: 'Cursos sintéticos' },
    {
      entries: [],
      reviewer: { name: 'Parecerista sintético' },
      revision: 1,
      catalogueRevision: 1,
      conclusion: 'Conclusão humana preservada.',
    },
  );
  expect(doc.html).toContain('Ofertas e cursos');
  expect(doc.html).toContain('Engenharia &lt;Elétrica&gt; &amp; Sistemas');
  expect(doc.text).toContain('Engenharia <Elétrica> & Sistemas');
  expect(doc.text).toContain('Licenciatura em Química');
  expect(doc.text).toContain('Tecnologia em Análise de Sistemas');
  expect(doc.text).toContain('Conclusão humana preservada.');
});

test('a date over every offer prints without the list of offers', () => {
  const state = calendarOffersFixture();
  const all = state.offers.map((offer) => offer.id);
  const saturday = civilDate(`${state.year}-03-13`);
  const events = [
    ...state.events,
    {
      id: 'saturday-step',
      name: 'Sábado letivo do teste',
      effect: 'include' as const,
      category: 'sabado',
      start: saturday,
      end: saturday,
      offers: all,
    },
    {
      id: 'campus-all-offers',
      name: 'Reunião escolhida para todas',
      effect: 'note' as const,
      start: saturday,
      end: saturday,
      offers: all,
    },
  ];
  const html = proensLayout(state, events, evaluateCalendar(state, events), null, '');
  const line = (name: string) => {
    const start = html.indexOf(`<td>${name}`);
    return start < 0 ? '' : html.slice(start, html.indexOf('</td>', start));
  };
  expect(line('Sábado letivo do teste')).not.toContain('[');
  expect(line('Reunião escolhida para todas')).not.toContain('[');
});
