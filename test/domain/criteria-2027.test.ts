import { expect, test } from 'vitest';
import { criteria } from '../../src/domain/policies/consup-292-2027/criteria.ts';
import { rules } from '../../src/domain/policies/consup-292-2027/requirements.ts';
import { consup2922027Policy } from '../../src/domain/policies/consup-292-2027/index.ts';

const ids = criteria.map((criterion) => criterion.id);
const linked = new Set(rules.flatMap((rule) => (rule.criterion ? [rule.criterion] : [])));

test('every rule names a declared criterion of its policy', () => {
  expect([...linked].filter((id) => !ids.includes(id))).toEqual([]);
});

test('only the documentary and counting criteria have no rule', () => {
  expect(ids.filter((id) => !linked.has(id)).sort()).toEqual(
    ['minutes', 'II', 'annual', 'semester', 'window'].sort(),
  );
});

test('criteria identifiers are unique and the wording is of the 2027 norm', () => {
  expect(new Set(ids).size).toBe(ids.length);
  for (const criterion of criteria) {
    expect(criterion.item, criterion.id).not.toContain('Art. 7º');
    expect(criterion.title, criterion.id).not.toContain('2026');
  }
});

test('every criterion states its requirement and its source', () => {
  for (const criterion of criteria) {
    expect(criterion.requirement, criterion.id).toBeTruthy();
    expect(criterion.source, criterion.id).toBeTruthy();
  }
});

const brazilian = (date: string) => date.split('-').reverse().join('/');
const requirementOf = (id: string) => criteria.find((item) => item.id === id)!.requirement!;

test('dates and hours of the wording match the declared rules', () => {
  const state = {
    year: 2027,
    offers: [
      {
        id: 'integrado',
        kind: 'integrado' as const,
        delivery: 'presencial' as const,
        organization: 'anual' as const,
      },
    ],
  };
  const window = consup2922027Policy.window(state)!;
  expect(requirementOf('window')).toContain(brazilian(window.start).slice(0, 5));
  expect(requirementOf('window')).toContain(brazilian(window.latestStart));
  expect(requirementOf('window')).toContain(brazilian(window.end));
  const { annual, semester } = consup2922027Policy.review.dayMinimums;
  expect(requirementOf('annual')).toContain(`${annual} dias`);
  expect(requirementOf('semester')).toContain(`${semester} dias`);
  for (const rule of rules) {
    if (!rule.criterion) continue;
    if (typeof rule.deadline === 'string')
      expect(requirementOf(rule.criterion), rule.id).toContain(brazilian(rule.deadline));
    if (typeof rule.minHours === 'number')
      expect(requirementOf(rule.criterion), rule.id).toContain(`${rule.minHours} horas`);
  }
});

test('a criterion with an optional activity says so', () => {
  for (const rule of rules) {
    if (!rule.criterion || !rule.optionalFor) continue;
    expect(requirementOf(rule.criterion), rule.id).toMatch(/opcional|facultativ/i);
  }
});
