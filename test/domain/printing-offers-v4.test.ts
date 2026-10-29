import { expect, test } from 'vitest';
import { calendarOffersV4Fixture } from '../fixtures/calendar-offers-v4.ts';
import { proensLayout } from '../../src/printing/calendar-layout.ts';
import { teachingDayBreakdown } from '../../src/printing/teaching-day-breakdown.ts';
import { reviewDocument } from '../../src/printing/review-export.ts';
import { evaluateCalendar } from '../../src/domain/calendar/counting/evaluation.ts';

test('calendar print identifies each offer in the header, periods, event scopes and teaching totals', () => {
  const state = calendarOffersV4Fixture();
  const result = evaluateCalendar(state, state.events);
  const { byModality: _legacy, ...byOfferOnly } = result;
  const html = proensLayout(state, state.events, byOfferOnly, null, '');
  for (const label of [
    'Técnico integrado',
    'Licenciatura em Química',
    'Engenharia Elétrica',
    'Tecnologia em Análise de Sistemas',
  ]) {
    expect(html).toContain(label);
    expect(html).toContain(`Dias letivos — ${label}`);
    expect(html).toContain(`[${label}]`);
  }
  expect(html).toContain('<th>Oferta</th>');
  expect(html).not.toContain('undefined');
  expect(html).not.toContain('[graduacao-2]');
  expect(html).not.toContain('[graduacao-3]');
});

test('semester distributions group stages by cycle and restart displayed numbering without changing bindings', () => {
  const state = calendarOffersV4Fixture();
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
      .filter((event) => event.offers?.includes('graduacao-2'))
      .map((event) => event.requirementId),
  ).toEqual([
    'stage-1:graduacao-2',
    'stage-2:graduacao-2',
    'stage-3:graduacao-2',
    'stage-4:graduacao-2',
  ]);
});

test('annual distributions retain the stage cycle and all displayed totals come from their own ledgers', () => {
  const state = calendarOffersV4Fixture();
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
  const state = calendarOffersV4Fixture();
  const expected = evaluateCalendar(state, state.events).byOffer['graduacao-2'].total;
  const stage = state.events.find((event) => event.id === 'graduacao-2-stage-3')!;
  stage.start = '2027-02-01';
  stage.end = '2027-04-16';
  const result = evaluateCalendar(state, state.events);
  const report = teachingDayBreakdown(state, state.events, result, 'graduacao-2');
  expect(report.annual.total).toBe(expected);
  expect(report.stages[2]).toMatchObject({
    available: false,
    total: null,
    start: '2027-02-01',
    end: '2027-04-16',
  });
  expect(
    report.notes.some(
      (note) => note.includes('1ª etapa — 2º semestre') && note.includes('seu ciclo'),
    ),
  ).toBe(true);
  const html = proensLayout(state, state.events, result, null, '');
  expect(html).toContain('01/02/2027 a 16/04/2027');
  expect(html).toContain('seu ciclo');
  expect(stage.requirementId).toBe('stage-3:graduacao-2');
});

test('scope and the normative window are printed for the applicable offer identities', () => {
  const state = calendarOffersV4Fixture();
  state.offers[1].scope = { status: 'own-regulation' };
  delete state.offers[2].scope;
  const html = proensLayout(state, state.events, null, null, '');
  expect(html).toContain('Licenciatura em Química: norma própria.');
  expect(html).toContain('Engenharia Elétrica: escopo a conferir antes de afirmar conformidade.');
  const window = html.match(/<p>Janela do ano letivo:.*?<\/p>/)?.[0] ?? '';
  expect(window).toContain('01/02/2027 a 17/12/2027');
  expect(window).toContain('Engenharia Elétrica');
  expect(window).not.toContain('Licenciatura em Química');
  for (const offer of state.offers) offer.scope = { status: 'own-regulation' };
  expect(proensLayout(state, state.events, null, null, '')).not.toContain(
    '<p>Janela do ano letivo:',
  );
});

test('print and review exports escape offer labels in HTML and preserve human text in the text export', () => {
  const state = calendarOffersV4Fixture();
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
