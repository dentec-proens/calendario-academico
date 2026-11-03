import { civilDate } from '../../src/domain/civil-date.ts';
import { expect, test } from 'vitest';
import { onceLink } from '../helpers/activity-links.ts';
import {
  eventFromValues,
  emptyEvent,
  eventValues,
  keptDestinations,
  type EventValues,
} from '../../web/features/calendar-editor/events/event-draft.ts';
import type { CalendarEvent } from '../../web/features/calendar-editor/types.ts';

const saved = (extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'saved',
  name: 'Registro salvo',
  start: civilDate('2027-05-10'),
  end: civilDate('2027-05-10'),
  effect: 'note',
  scope: { offers: ['integrado'], confirmed: true },
  ...extra,
});
const edit = (base: CalendarEvent, change: Partial<EventValues> = {}) =>
  eventFromValues({ ...eventValues(base), ...change }, { id: base.id, base });

test('a record without category keeps it absent when its category is left as it was', () => {
  const base = saved({ effect: 'exclude' });
  expect(eventValues(base).category).toBe('recesso');
  const result = edit(base, { name: 'Recesso renomeado' });
  expect(result.category).toBeUndefined();
  expect(result).toMatchObject({ effect: 'exclude', name: 'Recesso renomeado' });
  expect(edit(base, { category: 'feriado' }).category).toBe('feriado');
});

test('the link is not a form value: the date command decides it from the context', () => {
  const base = saved({ activity: onceLink('family-meeting') });
  expect(eventValues(base)).not.toHaveProperty('activity');
  expect(edit(base, { name: 'Encontro revisado' })).not.toHaveProperty('activity');
});

test('an unchanged reviewed deadline adjustment keeps its review', () => {
  const base = saved({
    activity: onceLink('regular-admission-notice'),
    notice: {
      publication: 'planned',
      admission: { type: 'regular', year: 2028, term: 'annual', destinations: [] },
    },
    deadlineAdjustment: { date: civilDate('2027-07-01'), reviewed: true },
  });
  expect(edit(base, { category: 'evento' }).deadlineAdjustment).toEqual({
    date: civilDate('2027-07-01'),
    reviewed: true,
  });
  expect(edit(base, { adjustedDeadline: '2027-07-02' }).deadlineAdjustment).toEqual({
    date: civilDate('2027-07-02'),
    reviewed: false,
  });
});

test('notice metadata is written only while the free event is answered as a notice', () => {
  const values: EventValues = {
    ...eventValues(saved()),
    eventType: 'notice',
    category: 'prazo',
    admissionType: 'transfer',
    admissionYear: '2027',
    publicationStatus: 'planned',
  };
  expect(eventFromValues(values, { id: 'new' })).toMatchObject({
    notice: { publication: 'planned', admission: { type: 'transfer', year: 2027 } },
  });
  const recess = eventFromValues(
    { ...values, eventType: 'recess', effect: 'exclude', category: 'recesso' },
    { id: 'new' },
  );
  expect(recess.notice).toBeUndefined();
});

const transfer = (destinations: { offerId: string; periodId: string }[]) =>
  saved({
    scope: { offers: ['integrado', 'graduacao'], confirmed: true },
    notice: {
      publication: 'planned',
      admission: { type: 'transfer', year: 2027, term: 'annual', destinations },
    },
  });

test('the form edits one destination common to every offer of the date', () => {
  const base = transfer([
    { offerId: 'integrado', periodId: 'year' },
    { offerId: 'graduacao', periodId: 'year' },
  ]);
  expect(eventValues(base).admissionPeriodId).toBe('year');
  expect(edit(base).notice).toEqual(base.notice);
  expect(edit(base, { admissionPeriodId: 'other' }).notice?.admission?.destinations).toEqual([
    { offerId: 'integrado', periodId: 'other' },
    { offerId: 'graduacao', periodId: 'other' },
  ]);
  expect(edit(base, { admissionPeriodId: '' }).notice?.admission?.destinations).toEqual([]);
  // A new offer of the date receives the common destination too.
  expect(
    edit(base, { offers: ['integrado', 'graduacao', 'subsequente'] }).notice?.admission
      ?.destinations,
  ).toHaveLength(3);
});

test('distinct destinations by offer are kept until a common destination is chosen', () => {
  const base = transfer([
    { offerId: 'integrado', periodId: 'year' },
    { offerId: 'graduacao', periodId: 'removed' },
  ]);
  expect(eventValues(base).admissionPeriodId).toBe(keptDestinations);
  expect(edit(base).notice).toEqual(base.notice);
  // Removing an offer from the date drops only its destination.
  expect(edit(base, { offers: ['graduacao'] }).notice?.admission?.destinations).toEqual([
    { offerId: 'graduacao', periodId: 'removed' },
  ]);
  expect(edit(base, { admissionPeriodId: 'year' }).notice?.admission?.destinations).toEqual([
    { offerId: 'integrado', periodId: 'year' },
    { offerId: 'graduacao', periodId: 'year' },
  ]);
  // An offer left without destination is not a common destination either.
  expect(
    eventValues(transfer([{ offerId: 'integrado', periodId: 'year' }])).admissionPeriodId,
  ).toBe(keptDestinations);
});

test('saving the date form confirms the offers chosen in it, as listed (plan, section 5.3)', () => {
  const base = saved({
    scope: { offers: ['integrado', 'graduacao'], confirmed: false },
  });
  // The form starts from the listed offers, never from the current ones.
  expect(eventValues(base).offers).toEqual(['integrado', 'graduacao']);
  expect(edit(base).scope).toEqual({ offers: ['integrado', 'graduacao'], confirmed: true });
  expect(edit(base, { offers: ['graduacao'] }).scope).toEqual({
    offers: ['graduacao'],
    confirmed: true,
  });
  // A new campus date starts with every offer of the calendar, confirmed when saved.
  expect(
    eventFromValues(
      {
        ...emptyEvent(['integrado', 'graduacao']),
        name: 'Nova data do campus',
        start: '2027-05-11',
        end: '2027-05-11',
        effect: 'note',
      },
      { id: 'new' },
    ).scope,
  ).toEqual({
    offers: ['integrado', 'graduacao'],
    confirmed: true,
  });
});
