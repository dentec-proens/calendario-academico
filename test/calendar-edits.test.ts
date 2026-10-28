import { expect, test } from 'vitest';
import {
  configureAssessment,
  recalculateCalendar,
  removePeriod,
} from '../src/calendar-edits/commands.ts';
import type { ActivityState } from '../src/domain-types.ts';

function calendar(): ActivityState {
  return {
    year: 2027,
    offer: 'integrado',
    modalities: ['integrado'],
    regime: 'anual',
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    weekEvidence: 'Ata aprovada',
    periods: [{ id: 'classes', start: '2027-03-01', end: '2027-03-26' }],
    assessmentStagesByModality: { integrado: 4 },
    events: Array.from({ length: 4 }, (_, index) => ({
      id: `event-${index + 1}`,
      requirementId: `stage-${index + 1}:integrado`,
      name: `${index + 1}ª etapa`,
      start: `2027-03-${String(index * 7 + 1).padStart(2, '0')}`,
      end: `2027-03-${String(index * 7 + 4).padStart(2, '0')}`,
      kind: 'note',
      category: 'limite',
      evidence: 'Organização pedagógica',
      modalities: ['integrado'],
    })),
  };
}

test('recalculating periods preserves every entered stage date, including legacy automatic markers', () => {
  const state = calendar();
  state.events = state.events.map((event) => ({ ...event, assessmentAutoStart: '2027-03-01' }));
  const before = structuredClone(state);
  const next = recalculateCalendar(state, [
    {
      id: 'holiday',
      name: 'Feriado',
      start: '2027-03-01',
      end: '2027-03-05',
      kind: 'exclude',
      evidence: 'Lei',
    },
  ]);
  const expected = before.events.map(({ evidence: _source, ...event }) => event);
  expect(next.events).toEqual(expected);
  expect(removePeriod(state, 'classes', []).events).toEqual(expected);
  expect(state).toEqual(before);
});

test('changing assessment organization preserves events while removing obsolete activity links and automatic anchors', () => {
  const state = calendar();
  state.events = state.events.map((event) => ({ ...event, assessmentAutoStart: '2027-03-01' }));
  const original = structuredClone(state);
  const changed = configureAssessment(state, { integrado: '2' }, []);
  expect(changed.assessmentStagesByModality).toEqual({ integrado: 2 });
  expect(changed.events).toHaveLength(4);
  for (let index = 2; index < 4; index++) {
    const {
      requirementId: _link,
      assessmentAutoStart: _anchor,
      evidence: _source,
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
