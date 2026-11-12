import { expect, test } from 'vitest';
import {
  mergePedagogicalMeetings,
  mergesPedagogicalMeetings,
} from '../../src/domain/calendar/normalization/pedagogical-meetings.ts';
import { policyFor } from '../../src/domain/policies/registry.ts';

const position = { status: 'defined', term: 'annual', number: 1 } as const;
const meeting = {
  id: 'meeting-1',
  name: 'Reunião pedagógica do 1º bimestre',
  start: '2027-04-20',
  end: '2027-04-20',
  effect: 'note',
  category: 'institucional',
  offers: ['integrado'],
  activity: { activityId: 'pedagogical-meeting', offerId: 'integrado', position },
};
const council = {
  ...meeting,
  id: 'council-1',
  name: 'Conselho de classe do 1º bimestre',
  activity: { activityId: 'council', offerId: 'integrado', position },
};
const free = { ...meeting, id: 'free', name: 'Feriado municipal', activity: undefined };

test('a date of the pedagogical meeting moves to the council of the same stage, as typed', () => {
  const events = mergePedagogicalMeetings([meeting, free])!;
  expect(events[0]).toEqual({
    ...meeting,
    activity: { activityId: 'council', offerId: 'integrado', position },
  });
  // Every other date is the same object: nothing else is rewritten.
  expect(events[1]).toBe(free);
});

test('a stage with both keeps both dates, now under one activity', () => {
  const events = mergePedagogicalMeetings([council, meeting])!;
  expect(events.map((event) => [event.id, event.activity?.activityId])).toEqual([
    ['council-1', 'council'],
    ['meeting-1', 'council'],
  ]);
});

test('without a meeting nothing is written, so running it again changes nothing', () => {
  expect(mergePedagogicalMeetings([council, free])).toBeUndefined();
  expect(mergePedagogicalMeetings(mergePedagogicalMeetings([meeting])!)).toBeUndefined();
});

test('only a policy that merged the meeting converts it; the operational checklist keeps it', () => {
  expect(mergesPedagogicalMeetings(policyFor(2027))).toBe(true);
  expect(mergesPedagogicalMeetings(policyFor(2026))).toBe(false);
  expect(mergesPedagogicalMeetings(policyFor(2031))).toBe(false);
});
