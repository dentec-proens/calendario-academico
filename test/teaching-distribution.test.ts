import type { CalendarActivity } from '../src/domain-types.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { evaluateCalendar } from '../src/evaluation.mjs';
import { teachingDayBreakdown, proensLayout } from '../web/print.mjs';

const state = {
  year: 2027,
  campus: 'Teste',
  offer: 'integrado',
  modalities: ['integrado', 'graduacao'],
  regime: 'semestral',
  assessmentStagesByModality: { integrado: 4, graduacao: 2 },
  weekdays: [1, 2, 3, 4, 5],
  weekConfirmed: true,
  weekEvidence: 'Ata',
  periods: [
    { id: 'p1', name: '1º semestre', start: '2027-06-21', end: '2027-07-02' },
    { id: 'p2', name: '2º semestre', start: '2027-08-02', end: '2027-08-13' },
  ],
};
const stage = (number: number, modality: string, start: string, end: string) => ({
  id: `${modality}${number}`,
  name: 'Etapa',
  requirementId: `stage-${number}:${modality}`,
  modalities: [modality],
  start,
  end,
  kind: 'note',
  evidence: 'Ata',
});
const events: CalendarActivity[] = [
  stage(1, 'integrado', '2027-06-21', '2027-06-25'),
  stage(2, 'integrado', '2027-06-26', '2027-07-02'),
  stage(3, 'integrado', '2027-08-02', '2027-08-06'),
  stage(4, 'integrado', '2027-08-09', '2027-08-13'),
  stage(1, 'graduacao', '2027-06-21', '2027-07-02'),
  stage(2, 'graduacao', '2027-08-02', '2027-08-13'),
  {
    id: 'holiday',
    name: 'Feriado',
    start: '2027-06-22',
    end: '2027-06-22',
    kind: 'exclude',
    modalities: ['integrado'],
    evidence: 'Lei',
  },
  {
    id: 'saturday',
    name: 'Sábado letivo',
    start: '2027-06-26',
    end: '2027-06-26',
    kind: 'include',
    modalities: ['integrado'],
    evidence: 'Ata',
  },
];

test('monthly, bimester, semester and annual weekday counts reconcile, respect offer scope and academic July dates', () => {
  const input = { ...state, events },
    result = evaluateCalendar(input, events),
    integrated = teachingDayBreakdown(input, events, result, 'integrado'),
    degree = teachingDayBreakdown(input, events, result, 'graduacao');
  assert.equal(integrated.months[5].total, 8);
  assert.equal(integrated.months[6].total, 2);
  assert.equal(integrated.months[0].total, 0);
  assert.deepEqual(
    integrated.stages.map((r) => r.total),
    [4, 6, 5, 5],
  );
  assert.deepEqual(
    integrated.semesters.map((r) => r.total),
    [10, 10],
  );
  assert.equal(integrated.semesters[0].end, '2027-07-02');
  assert.equal(integrated.semesters[0].byWeekday[2], 1);
  assert.equal(degree.semesters[0].byWeekday[2], 2);
  assert.equal(integrated.semesters[0].byWeekday[6], 1);
  assert.equal(degree.semesters[0].byWeekday[6], 0);
  assert.equal(degree.stages.length, 0);
  for (const report of [integrated, degree])
    for (const group of [
      report.months,
      report.semesters,
      ...(report.stages.length ? [report.stages] : []),
    ]) {
      assert.equal(
        group.reduce((sum, row) => sum + row.total, 0),
        report.annual.total,
      );
      for (let weekday = 0; weekday < 7; weekday++)
        assert.equal(
          group.reduce((sum, row) => sum + row.byWeekday[weekday], 0),
          report.annual.byWeekday[weekday],
        );
    }
  const html = proensLayout(input, events, result, { purpose: 'test' });
  for (const title of [
    'Distribuição por mês',
    'Distribuição por bimestre',
    'Distribuição por semestre letivo',
    'Consolidado anual',
    'Técnico integrado',
    'Graduação',
  ])
    assert(html.includes(title));
  assert(html.includes('Seg.'));
  assert(html.includes('Sáb.'));
  assert(html.includes('26/06/2027 a 02/07/2027'));
});

test('annual periods use the registered assessment intervals; missing or overlapping intervals are not invented', () => {
  const input = {
    ...state,
    modalities: ['integrado'],
    periods: [{ id: 'year', name: 'Anual', start: '2027-06-21', end: '2027-08-13' }],
    events,
  };
  const withRecess: CalendarActivity[] = [
    ...events,
    {
      name: 'Recesso',
      id: 'recess',
      start: '2027-07-03',
      end: '2027-08-01',
      kind: 'exclude',
      evidence: 'Ata',
    },
  ];
  const result = evaluateCalendar(input, withRecess),
    report = teachingDayBreakdown(input, withRecess, result, 'integrado');
  assert.deepEqual(
    report.semesters.map((r) => r.total),
    [10, 10],
  );
  assert.equal(report.notes.length, 0);
  const partial = withRecess.filter((e) => e.requirementId !== 'stage-2:integrado');
  const missing = teachingDayBreakdown(input, partial, result, 'integrado');
  assert.equal(missing.semesters[0].total, null);
  assert.equal(missing.stages[1].total, null);
  assert.equal(missing.annual.total, 20);
  const overlapping = {
    ...input,
    periods: [
      { id: 'a', start: '2027-06-21', end: '2027-07-05' },
      { id: 'b', start: '2027-07-02', end: '2027-08-13' },
    ],
  };
  const invalid = teachingDayBreakdown(overlapping, withRecess, result, 'integrado');
  assert(invalid.semesters.every((r) => r.total === null));
  assert(invalid.notes.some((n) => n.includes('sobreposição')));
  const unknown = teachingDayBreakdown(input, withRecess, null, 'integrado');
  assert.equal(unknown.months[0].total, null);
});

test('trimestral offers retain their three assessment intervals alongside monthly, semester and annual totals', () => {
  const input = {
    ...state,
    modalities: ['integrado'],
    assessmentStagesByModality: { integrado: 3 },
  };
  const trimesterEvents = [
    stage(1, 'integrado', '2027-06-21', '2027-06-25'),
    stage(2, 'integrado', '2027-06-28', '2027-08-05'),
    stage(3, 'integrado', '2027-08-06', '2027-08-13'),
  ];
  const report = teachingDayBreakdown(
    input,
    trimesterEvents,
    evaluateCalendar(input, trimesterEvents),
    'integrado',
  );
  assert.equal(report.stages.length, 3);
  assert.equal(report.stageLabel, 'trimestre');
  assert.equal(
    report.stages.reduce((sum, r) => sum + r.total, 0),
    report.annual.total,
  );
  assert.deepEqual(
    report.semesters.map((r) => r.total),
    [10, 10],
  );
});
