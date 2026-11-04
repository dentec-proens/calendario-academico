import { civilDate } from '../../src/domain/civil-date.ts';
import { expect, test } from 'vitest';
import { definedStage } from '../helpers/activity-links.ts';
import { recalculateCalendar } from '../../src/domain/calendar/commands/recalculate.ts';
import type { ActivityState } from '../../src/domain/calendar/model.ts';

function calendar(): ActivityState {
  return {
    schemaVersion: 5 as const,
    year: 2027,
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [
      {
        id: 'classes',
        start: civilDate('2027-03-01'),
        end: civilDate('2027-03-26'),
        association: { status: 'defined' as const, offers: ['integrado'], term: 'annual' as const },
      },
    ],
    events: Array.from({ length: 4 }, (_, index) => ({
      id: `event-${index + 1}`,
      activity: definedStage('stage', 'integrado', 'annual', index + 1),
      name: `${index + 1}ª etapa`,
      start: civilDate(`2027-03-${String(index * 7 + 1).padStart(2, '0')}`),
      end: civilDate(`2027-03-${String(index * 7 + 4).padStart(2, '0')}`),
      effect: 'note',
      category: 'limite',
      offers: ['integrado'],
    })),
    offers: [
      {
        id: 'integrado',
        kind: 'integrado' as const,
        delivery: 'a-conferir' as const,
        organization: 'anual' as const,
        stages: { status: 'defined', perTerm: 4 },
      },
    ],
  };
}

test('recalculating periods preserves every entered stage date, including legacy automatic markers', () => {
  const state = calendar();
  state.events = state.events.map((event) => ({
    ...event,
    assessmentAutoStart: civilDate('2027-03-01'),
  }));
  const before = structuredClone(state);
  const next = recalculateCalendar(state, [
    {
      id: 'holiday',
      name: 'Feriado',
      start: civilDate('2027-03-01'),
      end: civilDate('2027-03-05'),
      effect: 'exclude',
      offers: state.offers.map((offer) => offer.id),
    },
  ]);
  const expected = before.events;
  expect(next.events).toEqual(expected);
  expect(state).toEqual(before);
});
