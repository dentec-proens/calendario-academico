import { expect, test } from 'vitest';
import { rehearseCalendar, type RehearsalBase } from '../../src/domain/calendar/rehearsal.ts';
import { readyContent } from '../helpers/lifecycle.ts';

const base: RehearsalBase = { revision: 1, events: [] };
const calendar = (status: 'rascunho' | 'enviado', rulesetVersion?: string) => {
  const content = readyContent();
  return {
    status,
    year: 2027,
    campus: 'Campus',
    state: { ...content, rulesetVersion } as unknown as Record<string, unknown>,
    catalogueRevision: 1,
    institutionalSnapshot: [],
    documentSnapshot: [],
  };
};

test('a calendar under older rules saves, and only its stamp changes', () => {
  const result = rehearseCalendar(calendar('rascunho', 'consup-292-2027-v6'), base);
  if (result.outcome !== 'saves') throw new Error(result.outcome);
  expect(result.changed.map(({ path }) => path)).toContain('rulesetVersion');
  expect(result.changed.filter(({ path }) => /start|end/i.test(path))).toEqual([]);
});

test('a calendar that the checks of a save refuse is reported, not hidden', () => {
  const broken = calendar('rascunho');
  broken.state = { ...broken.state, periods: 'inválido' };
  expect(rehearseCalendar(broken, base).outcome).toBe('fails');
});

test('a calendar under review that older rules bind needs a return', () => {
  expect(rehearseCalendar(calendar('enviado', 'consup-292-2027-v6'), base)).toEqual({
    outcome: 'needs-return',
  });
});

test('a published calendar reads only its frozen base and has nothing to return', () => {
  const published = { ...calendar('enviado', 'consup-292-2027-v6'), status: 'vigente' as const };
  expect(rehearseCalendar(published, base)).toEqual({ outcome: 'unaffected' });
});
