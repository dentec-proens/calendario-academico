import type { CalendarActivity } from '../src/domain-types.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { activityChecklist, assessmentCount } from '../src/obligations.ts';
import {
  suggestStages,
  suggestStageEnd,
  recalculateAssessmentStages,
  assessmentDayCounts,
} from '../src/stage-suggestions.ts';
import { evaluateCalendar } from '../src/evaluation.ts';
import { proensLayout } from '../web/print.ts';
import { recalculatePeriods } from '../src/duration.ts';

const state = {
  year: 2027,
  offer: 'integrado',
  modalities: ['integrado', 'graduacao'],
  regime: 'semestral',
  assessmentStagesByModality: { integrado: 4, graduacao: 2 },
  weekdays: [1, 2, 3, 4, 5],
  weekConfirmed: true,
  weekEvidence: 'Ata',
  periods: [
    { id: 'p', name: '1º semestre', start: '2027-03-01', end: '2027-03-12' },
    { id: 'q', name: '2º semestre', start: '2027-04-01', end: '2027-04-14' },
  ],
  events: [] as CalendarActivity[],
};
const scoped = (m: string) => ({ ...state, offer: m, modalities: [m] });
test('100-day semesters control 50-day bimesters even when the last entered stage exceeds the old period', () => {
  let s = {
    ...state,
    periods: [
      { id: 'p', name: 'First', start: '2027-02-15', end: '2027-06-01', targetDays: 100 },
      { id: 'q', name: 'Second', start: '2027-08-02', end: '2027-12-01', targetDays: 100 },
    ],
  };
  s.periods = recalculatePeriods(s, []);
  const stages = ['integrado', 'graduacao'].flatMap((m) =>
    suggestStages({ ...s, offer: m, modalities: [m] }, [], s.periods[0].start).stages.map(
      (e, i) => ({ ...e, id: m + i, kind: 'note', modalities: [m], evidence: 'Ata' }),
    ),
  );
  stages.find((e) => e.requirementId === 'stage-4:integrado')!.end = '2027-12-31';
  s.events = stages;
  const check = (events: CalendarActivity[]) => {
    s.periods = recalculatePeriods(s, events);
    s.events = recalculateAssessmentStages({ ...s, events }, events);
    const totals = assessmentDayCounts(s, s.events);
    for (const row of s.events.filter((e) => e.requirementId?.startsWith('stage-')))
      assert.equal(totals[row!.id][0].days, row.modalities![0] === 'integrado' ? 50 : 100);
    assert.equal(
      s.events.find((e) => e.requirementId === 'stage-4:integrado')!.end,
      s.periods[1].end,
    );
    for (const r of Object.values(evaluateCalendar(s, s.events).byModality))
      assert.equal(r.total, 200);
  };
  check(stages);
  const before = s.periods[0].end;
  check([
    ...s.events,
    {
      name: 'Feriado',
      id: 'h',
      kind: 'exclude',
      start: '2027-03-01',
      end: '2027-03-05',
      evidence: 'Lei',
    },
    {
      name: 'Sábado',
      id: 'sat',
      kind: 'include',
      start: '2027-03-06',
      end: '2027-03-06',
      evidence: 'Ata',
    },
  ]);
  assert(s.periods[0].end > before);
  const partial = { ...s, events: s.events.filter((e) => e.requirementId !== 'stage-2:integrado') };
  assert(
    !recalculateAssessmentStages(partial, partial.events).some(
      (e) => e.requirementId === 'stage-2:integrado',
    ),
  );
});
test('automatic stages update after holidays and Saturdays, scoped by offer', () => {
  const original = ['integrado', 'graduacao'].flatMap((m) =>
    suggestStages(scoped(m), [], '2027-03-01').stages.map((s, i) => ({
      ...s,
      id: m + i,
      kind: 'note',
      modalities: [m],
      assessmentAutoStart: '2027-03-01',
    })),
  );
  const holiday = {
    id: 'h',
    kind: 'exclude',
    start: '2027-03-05',
    end: '2027-03-05',
    evidence: 'Lei',
    modalities: ['integrado'],
  };
  const saturday = {
    id: 's',
    kind: 'include',
    start: '2027-03-06',
    end: '2027-03-06',
    evidence: 'Ata',
    modalities: ['integrado'],
  };
  const current = { ...state, events: [...original, holiday, saturday] };
  const changed = recalculateAssessmentStages(current, current.events);
  assert.equal(changed.find((e) => e.id === 'integrado0')!.end, '2027-03-06');
  assert.equal(changed.find((e) => e.id === 'graduacao0')!.end, '2027-03-12');
  const counts = assessmentDayCounts({ ...current, events: changed }, changed);
  assert.deepEqual(counts.integrado0, [
    { modality: 'integrado', days: 5, saturdays: 1, excluded: 1 },
  ]);
  assert.equal(original[0].end, '2027-03-05');
  const blocked = [
    ...changed,
    {
      id: 'block',
      kind: 'exclude',
      start: '2027-03-06',
      end: '2027-03-06',
      evidence: 'Lei',
      modalities: ['integrado'],
    },
  ];
  const next = recalculateAssessmentStages({ ...state, events: blocked }, blocked);
  assert.equal(next.find((e) => e.id === 'integrado0')!.end, '2027-03-08');
  assert.equal(assessmentDayCounts({ ...state, events: next }, next).integrado0[0].saturdays, 0);
  const restored = recalculateAssessmentStages({ ...state, events: original }, original);
  assert.equal(restored[0].end, '2027-03-05');
});
test('manual dates and deleted stages are not overwritten or recreated', () => {
  const original = suggestStages(scoped('integrado'), [], '2027-03-01').stages.map((s, i) => ({
    ...s,
    id: 't' + i,
    kind: 'note',
    modalities: ['integrado'],
  }));
  const holiday = {
    id: 'h',
    kind: 'exclude',
    start: '2027-03-05',
    end: '2027-03-05',
    evidence: 'Lei',
  };
  const events = [...original, holiday];
  assert.deepEqual(recalculateAssessmentStages({ ...state, events }, events), events);
  const incomplete = original.slice(1).map((e) => ({ ...e, assessmentAutoStart: '2027-03-01' }));
  assert.deepEqual(
    recalculateAssessmentStages({ ...state, events: incomplete }, incomplete),
    incomplete,
  );
});
test('cleared offer does not inherit the old shared count or affect another offer', () => {
  const cleared = { ...state, assessmentStagesByModality: { graduacao: 2 } };
  assert(Number.isNaN(assessmentCount(cleared, 'integrado')));
  assert.equal(assessmentCount(cleared, 'graduacao'), 2);
  const stages = activityChecklist(cleared).filter((r) => r.id.startsWith('stage-'));
  assert.equal(stages.length, 2);
  assert(stages.every((r) => r.modality === 'graduacao'));
  assert.equal(
    activityChecklist({ ...cleared, assessmentStagesByModality: {} }).filter((r) =>
      r.id.startsWith('stage-'),
    ).length,
    0,
  );
});
test('three trimesters coexist with undergraduate semesters', () => {
  const configuration = { integrado: 3, graduacao: 2 };
  const stages = suggestStages(
    { ...scoped('integrado'), assessmentStagesByModality: configuration },
    [],
    '2027-03-01',
  ).stages;
  assert.equal(stages.length, 3);
  assert.equal(
    stages.reduce((sum, s) => sum + s.days, 0),
    20,
  );
  assert.deepEqual(
    stages.map((s) => s.days),
    [7, 7, 6],
  );
  assert.equal(stages[0].start, '2027-03-01');
  assert.equal(stages[2].end, '2027-04-14');
  assert.equal(
    activityChecklist({ ...state, assessmentStagesByModality: configuration }).filter((r) =>
      r.id.startsWith('stage-'),
    ).length,
    5,
  );
  const events = stages.map((s, i) => ({
    ...s,
    id: 't' + i,
    kind: 'note',
    modalities: ['integrado'],
  }));
  assert.equal(
    suggestStages(
      { ...scoped('graduacao'), assessmentStagesByModality: configuration },
      events,
      '2027-03-01',
    ).stages.length,
    2,
  );
});
test('four integrated stages and two undergraduate stages coexist without double counting', () => {
  const technical = suggestStages(scoped('integrado'), [], '2027-03-01');
  const events = technical.stages.map((s, i) => ({
    ...s,
    id: 't' + i,
    kind: 'note',
    category: 'limite',
    evidence: 'Ata',
    modalities: ['integrado'],
  }));
  const undergraduate = suggestStages(scoped('graduacao'), events, '2027-03-01');
  assert.equal(technical.stages.length, 4);
  assert.equal(undergraduate.stages.length, 2);
  assert.equal(technical.stages[0].end, '2027-03-05');
  assert.equal(undergraduate.stages[0].end, '2027-03-12');
  const rows = activityChecklist(state);
  events.push(
    ...undergraduate.stages.map((s, i) => ({
      ...s,
      id: 'g' + i,
      kind: 'note',
      category: 'limite',
      evidence: 'Ata',
      modalities: ['graduacao'],
    })),
  );
  for (const event of events) {
    const row = rows.find((r) => r.id === event.requirementId)!;
    assert.equal(row!.modality, event.modalities[0]);
    event.name = row!.name;
  }
  assert.equal(new Set(events.map((e) => e.requirementId)).size, 6);
  const result = evaluateCalendar(state, events);
  assert.equal(result.byModality.integrado.total, 20);
  assert.equal(result.byModality.graduacao.total, 20);
  const html = proensLayout(state, events, result, {
    name: 'Teste',
    courses: 'Teste',
    purpose: 'test',
    version: 1,
  });
  assert.match(html, /bimestral/);
  assert.match(html, /semestral/);
  assert.throws(() => suggestStages(state, [], '2027-03-01'), /separadamente/);
});
test('stage end and holidays are scoped to the selected offer', () => {
  const events = [
    {
      id: 'holiday',
      kind: 'exclude',
      start: '2027-03-05',
      end: '2027-03-05',
      modalities: ['integrado'],
      evidence: 'Lei',
    },
  ];
  assert.equal(suggestStageEnd(scoped('integrado'), events, '2027-03-01', 1).end, '2027-03-08');
  assert.equal(suggestStageEnd(scoped('graduacao'), events, '2027-03-01', 1).end, '2027-03-12');
});
