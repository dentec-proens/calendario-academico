import { expect, test } from 'vitest';
import {
  configureAssessment,
  enableAutomaticAssessment,
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

test('removing a period recalculates automatic stages and permits an empty calendar without losing events', () => {
  const state = enableAutomaticAssessment(
    {
      ...calendar(),
      periods: [
        { id: 'first', start: '2027-03-01', end: '2027-03-12' },
        { id: 'second', start: '2027-08-02', end: '2027-08-13' },
      ],
    },
    [],
  );
  expect(state.events.at(-1)?.end).toBe('2027-08-13');
  const changed = removePeriod(state, 'second', []);
  expect(changed.periods).toHaveLength(1);
  expect(changed.events.at(-1)?.end).toBe('2027-03-12');
  const empty = removePeriod(changed, 'first', []);
  expect(empty.periods).toEqual([]);
  expect(empty.events).toEqual(changed.events);
  expect(state.periods).toHaveLength(2);
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
      ...preserved
    } = original.events[index];
    expect(changed.events[index]).toEqual(preserved);
  }
  expect(changed.events.slice(0, 2).map((event) => [event.start, event.end])).toEqual([
    ['2027-03-01', '2027-03-12'],
    ['2027-03-15', '2027-03-26'],
  ]);
  expect(state).toEqual(original);
  expect(() => configureAssessment(state, { integrado: '5' }, [])).toThrow('número de etapas');
  expect(state).toEqual(original);
});

test('automatic assessment regenerates a complete manually edited group without losing event metadata', () => {
  const state = calendar();
  const original = structuredClone(state);
  const changed = enableAutomaticAssessment(state, []);
  expect(changed.events.map((event) => [event.start, event.end])).toEqual([
    ['2027-03-01', '2027-03-05'],
    ['2027-03-08', '2027-03-12'],
    ['2027-03-15', '2027-03-19'],
    ['2027-03-22', '2027-03-26'],
  ]);
  expect(changed.events.map((event) => event.assessmentAutoStart)).toEqual(
    Array<string>(4).fill('2027-03-01'),
  );
  expect(changed.events[0]).toMatchObject({
    id: 'event-1',
    name: '1ª etapa',
    evidence: 'Organização pedagógica',
    category: 'limite',
  });
  expect(state).toEqual(original);
});

test('automatic assessment rejects absent, incomplete and duplicate groups atomically', () => {
  const absent = { ...calendar(), events: [] };
  expect(() => enableAutomaticAssessment(absent, [])).toThrow('Preencha as etapas');
  const incomplete = calendar();
  incomplete.events.pop();
  const original = structuredClone(incomplete);
  expect(() => enableAutomaticAssessment(incomplete, [])).toThrow('Preencha todas as etapas');
  expect(incomplete).toEqual(original);
  const duplicate = calendar();
  duplicate.events[3].requirementId = duplicate.events[0].requirementId;
  const duplicated = structuredClone(duplicate);
  expect(() => enableAutomaticAssessment(duplicate, [])).toThrow('duplicadas');
  expect(duplicate).toEqual(duplicated);
});
