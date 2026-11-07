import { expect, test } from 'vitest';
import { activityPlan } from '../../src/domain/calendar/activities/plan.ts';
import { criterionDestination } from '../../web/features/calendar-editor/editor-steps.ts';
import { readyContent } from '../helpers/lifecycle.ts';

const plan = activityPlan({ ...readyContent(), year: 2027 });
const path = (id: string) => criterionDestination(plan, id)?.to;

test('a criterion of one activity opens that activity', () => {
  expect(criterionDestination(plan, 'VI')).toEqual({
    to: '/calendarios/$calendarId/atividades',
    search: { atividade: 'recognition:cycle:annual', atividadeVisao: undefined },
  });
});

test('a criterion of several activities leads to the step that lists them', () => {
  expect(criterionDestination(plan, 'XIII')?.search).toEqual({ atividade: undefined });
  expect(path('XIII')).toBe('/calendarios/$calendarId/atividades');
  // Assessment stages are filled in the organization step.
  expect(path('I')).toBe('/calendarios/$calendarId/periodos');
});

test('criteria outside the activities use the destinations of their issues', () => {
  expect(path('window')).toBe('/calendarios/$calendarId/periodos');
  expect(criterionDestination(plan, 'II')).toEqual({
    to: '/calendarios/$calendarId/atividades',
    search: { atividadeOrigem: 'base' },
  });
  expect(path('III')).toBe('/calendarios/$calendarId/ferias');
  expect(path('IV')).toBe('/calendarios/$calendarId/ferias');
});

test('no link for what no step decides, or for an activity no longer in the calendar', () => {
  for (const id of ['annual', 'semester', 'minutes', 'retired'])
    expect(criterionDestination(plan, id)).toBeUndefined();
});
