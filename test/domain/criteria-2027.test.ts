import { expect, test } from 'vitest';
import { criteria } from '../../src/domain/policies/consup-292-2027/criteria.ts';
import { rules } from '../../src/domain/policies/consup-292-2027/requirements.ts';

const ids = criteria.map((criterion) => criterion.id);
const linked = new Set(rules.flatMap((rule) => (rule.criterion ? [rule.criterion] : [])));

test('every rule names a declared criterion of its policy', () => {
  expect([...linked].filter((id) => !ids.includes(id))).toEqual([]);
});

test('only the documentary and counting criteria have no rule', () => {
  expect(ids.filter((id) => !linked.has(id)).sort()).toEqual(
    ['minutes', 'II', 'III', 'IV', 'annual', 'semester', 'window'].sort(),
  );
});

test('criteria identifiers are unique and the wording is of the 2027 norm', () => {
  expect(new Set(ids).size).toBe(ids.length);
  for (const criterion of criteria) {
    expect(criterion.item, criterion.id).not.toContain('Art. 7º');
    expect(criterion.title, criterion.id).not.toContain('2026');
  }
});
