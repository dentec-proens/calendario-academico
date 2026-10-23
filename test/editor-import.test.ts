import { test } from 'vitest';
import assert from 'node:assert/strict';
import { validateImport } from '../web/editor-import.ts';

function draft() {
  return {
    schemaVersion: 2,
    campus: 'Campus de teste',
    year: 2027,
    offer: 'integrado',
    assessmentStagesByModality: {},
    ignoredHistory: [],
    modalities: ['integrado'],
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

test('editor imports canonical drafts and preserves day targets', () => {
  const state = validateImport(draft());
  assert.deepEqual(state.modalities, ['integrado']);
  assert.deepEqual(state.ignoredHistory, []);
  assert.deepEqual(state.assessmentStagesByModality, {});
  assert.equal(state.periods[0].targetDays, 200);
});

test('editor rejects legacy files and missing canonical fields without inventing history', () => {
  const legacy: Record<string, unknown> = { ...draft(), schemaVersion: 1 };
  assert.throws(() => validateImport(legacy), /incompatível/);
  for (const key of ['modalities', 'assessmentStagesByModality', 'ignoredHistory']) {
    const incomplete: Record<string, unknown> = { ...draft() };
    delete incomplete[key];
    assert.throws(() => validateImport(incomplete));
  }
  assert.throws(() => validateImport({ ...draft(), assessmentStages: 4 }));
  assert.throws(() =>
    validateImport({ ...draft(), teacherVacations: { julyStart: '2027-07-01', evidence: 'Ata' } }),
  );
});

test('editor rejects invalid JSON structures and dates before replacing the current draft', () => {
  for (const value of [
    null,
    {},
    { ...draft(), schemaVersion: 1 },
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
