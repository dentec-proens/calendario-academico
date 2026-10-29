import { expect, test } from 'vitest';
import { configureAssessment } from '../../src/domain/calendar/commands/organization.ts';
import { recalculateCalendar } from '../../src/domain/calendar/commands/recalculate.ts';
import { removePeriod } from '../../src/domain/calendar/commands/periods.ts';
import type { ActivityState } from '../../src/domain/calendar/model.ts';

function calendar(): ActivityState {
  return {
    schemaVersion: 4 as const,
    year: 2027,
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [
      {
        id: 'classes',
        start: '2027-03-01',
        end: '2027-03-26',
        association: { status: 'defined' as const, offers: ['integrado'], term: 'annual' as const },
      },
    ],
    events: Array.from({ length: 4 }, (_, index) => ({
      id: `event-${index + 1}`,
      requirementId: `stage-${index + 1}:integrado`,
      name: `${index + 1}ª etapa`,
      start: `2027-03-${String(index * 7 + 1).padStart(2, '0')}`,
      end: `2027-03-${String(index * 7 + 4).padStart(2, '0')}`,
      kind: 'note',
      category: 'limite',
      offers: ['integrado'],
    })),
    offers: [
      {
        id: 'integrado',
        kind: 'integrado' as const,
        delivery: 'a-conferir' as const,
        organization: 'anual' as const,
        stages: { perTerm: 4 },
      },
    ],
  };
}

test('recalculating periods preserves every entered stage date, including legacy automatic markers', () => {
  const state = calendar();
  state.events = state.events.map((event) => ({ ...event, assessmentAutoStart: '2027-03-01' }));
  const before = structuredClone(state);
  const next = recalculateCalendar(state, [
    { id: 'holiday', name: 'Feriado', start: '2027-03-01', end: '2027-03-05', kind: 'exclude' },
  ]);
  const expected = before.events;
  expect(next.events).toEqual(expected);
  expect(removePeriod(state, 'classes', []).events).toEqual(expected);
  expect(state).toEqual(before);
});

test('changing assessment organization preserves events while removing obsolete activity links and automatic anchors', () => {
  const state = calendar();
  state.events = state.events.map((event) => ({ ...event, assessmentAutoStart: '2027-03-01' }));
  const original = structuredClone(state);
  const changed = configureAssessment(state, { integrado: '2' }, []);
  expect(changed.offers[0].stages).toEqual({ perTerm: 2 });
  expect(changed.events).toHaveLength(4);
  for (let index = 2; index < 4; index++) {
    const {
      requirementId: _link,
      assessmentAutoStart: _anchor,
      ...preserved
    } = original.events[index];
    expect(changed.events[index]).toEqual(preserved);
  }
  expect(changed.events.slice(0, 2).map((event) => [event.start, event.end])).toEqual([
    ['2027-03-01', '2027-03-04'],
    ['2027-03-08', '2027-03-11'],
  ]);
  expect(state).toEqual(original);
  expect(() => configureAssessment(state, { integrado: '5' }, [])).toThrow('número de etapas');
  expect(state).toEqual(original);
});
