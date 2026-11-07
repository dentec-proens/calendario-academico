import { expect, test } from 'vitest';
import {
  excludedDays,
  groupExcludedDays,
  runDays,
} from '../../src/domain/calendar/excluded-days.ts';
import { removeEvent, restoreEvents } from '../../src/domain/calendar/commands/events.ts';

test('only dates that exclude days explain a day, across their whole range', () => {
  const days = excludedDays([
    { name: 'Recesso', start: '2027-01-30', end: '2027-02-01', effect: 'exclude' },
    { name: 'Reunião', start: '2027-01-31', end: '2027-01-31', effect: 'note' },
    { name: 'Feriado', start: '2027-02-01', end: '2027-02-01', effect: 'exclude' },
  ]);
  expect([...days]).toEqual([
    ['2027-01-30', ['Recesso']],
    ['2027-01-31', ['Recesso']],
    ['2027-02-01', ['Recesso', 'Feriado']],
  ]);
});

test('consecutive days with the same reasons read as one run', () => {
  const runs = groupExcludedDays([
    { date: '2027-09-07', names: ['Independência'] },
    { date: '2027-09-20', names: ['Recesso'] },
    { date: '2027-09-21', names: ['Recesso'] },
    { date: '2027-09-22', names: [] },
    { date: '2027-09-23', names: ['Recesso'] },
  ]);
  expect(runs.map((run) => [runDays(run), run.names])).toEqual([
    ['7', ['Independência']],
    ['20 a 21', ['Recesso']],
    ['23', ['Recesso']],
  ]);
});

test('undoing a removal leaves the state as it was', () => {
  const before = {
    events: [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ],
  } as unknown as Parameters<typeof removeEvent>[0];
  const removed = removeEvent(before, 'b');
  expect(removed.events.map((event) => event.id)).toEqual(['a', 'c']);
  expect(restoreEvents(removed, before)).toEqual(before);
});
