import { expect, test } from 'vitest';
import { labelKey, repeatedLabel, type LabelledCalendar } from '../../src/domain/calendar/label.ts';

test('labels compare without case, accents or surrounding spaces', () => {
  expect(labelKey('  Cursos Técnicos ')).toBe(labelKey('cursos tecnicos'));
  expect(labelKey('Cursos técnicos')).not.toBe(labelKey('Cursos técnicos 2'));
  expect(labelKey(undefined)).toBe('');
});

test('a label repeats another current calendar of the campus and year, except its origin or version', () => {
  const calendar = (
    id: string,
    label: string,
    extra: Partial<LabelledCalendar> = {},
  ): LabelledCalendar => ({ id, status: 'rascunho', label, ...extra });
  const origin = calendar('origin', 'Integrados', { status: 'vigente' });
  const version = calendar('version', 'Integrados', { derivedFrom: 'origin' });
  const sibling = calendar('sibling', 'INTEGRADOS', { derivedFrom: 'origin' });
  const archived = calendar('archived', 'Subsequentes', { status: 'arquivado' });
  const all = [origin, version, sibling, archived];

  expect(repeatedLabel(version, version.label, [origin, archived])).toBeUndefined();
  expect(repeatedLabel(origin, origin.label, [origin, version])).toBeUndefined();
  expect(repeatedLabel(version, version.label, all)).toBe(sibling);
  expect(repeatedLabel(sibling, 'subsequentes', all), 'an archived calendar left the set').toBe(
    undefined,
  );
  expect(repeatedLabel(calendar('new', ''), 'Íntegrados', all)).toBe(origin);
});
