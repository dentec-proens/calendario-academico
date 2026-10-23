import { test } from 'vitest';
import assert from 'node:assert/strict';
import { validateImport } from '../web/editor-import.ts';

function draft() {
  return {
    schemaVersion: 1,
    campus: 'Campus de teste',
    year: 2027,
    offer: 'integrado',
    regime: 'anual',
    weekdays: [1, 2, 3, 4, 5],
    weekEvidence: 'Ata de teste',
    weekConfirmed: true,
    periods: [
      { id: 'period', name: 'Ano letivo', start: '2027-02-01', end: '2027-12-10', targetDays: 200 },
    ],
    events: [],
  };
}

test('editor imports legacy drafts with current typed defaults and preserves day targets', () => {
  const state = validateImport(draft());
  assert.deepEqual(state.modalities, ['integrado']);
  assert.deepEqual(state.ignoredHistory, []);
  assert.deepEqual(state.assessmentStagesByModality, {});
  assert.equal(state.periods[0].targetDays, 200);
});

test('editor upgrades legacy assessment choices and vacations without losing their meaning', () => {
  const state = validateImport({
    ...draft(),
    assessmentStages: 4,
    teacherVacations: { julyStart: '2027-07-01', evidence: 'Ata de férias' },
  });
  assert.deepEqual(state.assessmentStagesByModality, { integrado: 4 });
  assert.deepEqual(state.teacherVacations, {
    firstStart: '2027-01-02',
    firstEnd: '2027-01-31',
    secondStart: '2027-07-01',
    secondEnd: '2027-07-15',
    thirdStart: undefined,
    thirdEnd: undefined,
    evidence: 'Ata de férias',
  });
  assert.equal(state.events.filter((event) => event.category === 'ferias').length, 2);
});

test('editor rejects invalid JSON structures and dates before replacing the current draft', () => {
  for (const value of [
    null,
    {},
    { ...draft(), schemaVersion: 2 },
    { ...draft(), weekdays: [1, 1] },
    {
      ...draft(),
      events: [
        {
          id: 'bad',
          name: 'Data inválida',
          start: '2027-02-30',
          end: '2027-02-30',
          kind: 'note',
          evidence: 'Teste',
        },
      ],
    },
  ]) {
    assert.throws(() => validateImport(value));
  }
});
