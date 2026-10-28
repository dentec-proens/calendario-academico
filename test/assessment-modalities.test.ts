import { expect, test } from 'vitest';
import assert from 'node:assert/strict';
import { activityChecklist, assessmentCount } from '../src/obligations.ts';
import { assessmentDayCounts } from '../src/assessment-day-counts.ts';
import { recalculateCalendar } from '../src/calendar-edits/commands.ts';
import type { ActivityState } from '../src/domain-types.ts';

const state: ActivityState = {
  year: 2027,
  offer: 'integrado',
  modalities: ['integrado', 'graduacao'],
  regime: 'anual',
  weekdays: [1, 2, 3, 4, 5],
  weekConfirmed: true,
  weekEvidence: 'Ata',
  assessmentStagesByModality: { integrado: 4, graduacao: 2 },
  periods: [{ id: 'p', start: '2027-03-01', end: '2027-03-26' }],
  events: ['integrado', 'graduacao'].flatMap((modality) =>
    [0, 1].map((index) => ({
      id: `${modality}-${index}`,
      name: `${index + 1}ª etapa`,
      requirementId: `stage-${index + 1}:${modality}`,
      modalities: [modality],
      kind: 'note',
      start: index ? '2027-03-15' : '2027-03-01',
      end: index ? '2027-03-26' : '2027-03-12',
      evidence: 'Ata',
    })),
  ),
};

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

test('holidays and inclusions update per-offer counts without moving any assessment boundaries', () => {
  const events = [
    ...state.events,
    {
      id: 'h',
      name: 'Feriado',
      kind: 'exclude',
      start: '2027-03-05',
      end: '2027-03-05',
      modalities: ['integrado'],
      evidence: 'Lei',
    },
    {
      id: 'sat',
      name: 'Sábado',
      kind: 'include',
      start: '2027-03-06',
      end: '2027-03-06',
      modalities: ['integrado'],
      evidence: 'Ata',
    },
  ];
  const current = { ...state, events };
  const before = structuredClone(current);
  const next = recalculateCalendar(current, []);
  expect(next.events).toEqual(before.events);
  expect(assessmentDayCounts(next, next.events)['integrado-0']).toEqual([
    { modality: 'integrado', days: 10, saturdays: 1, excluded: 1 },
  ]);
  expect(assessmentDayCounts(next, next.events)['graduacao-0']).toEqual([
    { modality: 'graduacao', days: 10, saturdays: 0, excluded: 0 },
  ]);
});

test('different quantities of manual assessment stages coexist by offer', () => {
  const configuration = { ...state, assessmentStagesByModality: { integrado: 3, graduacao: 2 } };
  expect(activityChecklist(configuration).filter((r) => r.id.startsWith('stage-'))).toHaveLength(5);
  expect(
    activityChecklist(configuration).find((r) => r.id === 'stage-3:graduacao'),
  ).toBeUndefined();
});
