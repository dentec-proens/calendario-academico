import { test } from 'vitest';
import assert from 'node:assert/strict';
import { selectableCampuses } from '../../src/domain/institution/campus-selection.ts';

test('campus selection excludes archived units without changing IDs or historical order', () => {
  const campuses = [
    { id: 'toledo', name: 'Toledo' },
    { id: 'archived', name: 'Campus antigo', archived: true },
    { id: 'arapongas', name: 'Arapongas' },
    { id: 'reitoria', name: 'Reitoria', archived: false },
  ];
  const before = structuredClone(campuses);
  assert.deepEqual(
    selectableCampuses(campuses).map((campus: { id: string }) => campus.id),
    ['arapongas', 'reitoria', 'toledo'],
  );
  assert.deepEqual(campuses, before);
});
