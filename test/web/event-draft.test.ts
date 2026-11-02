import { civilDate } from '../../src/domain/civil-date.ts';
import { expect, test } from 'vitest';
import {
  eventFromValues,
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
  offers: ['integrado'],
  ...extra,
});
const edit = (base: CalendarEvent, change: Partial<EventValues> = {}) =>
  eventFromValues({ ...eventValues(base, ['integrado']), ...change }, { id: base.id, base });

test('a record without category keeps it absent when only its link changes', () => {
  const base = saved({ effect: 'exclude' });
  expect(eventValues(base, ['integrado']).category).toBe('recesso');
  const result = edit(base, { requirementId: 'family-meeting' });
  expect(result.category).toBeUndefined();
  expect(result).toMatchObject({ effect: 'exclude', requirementId: 'family-meeting' });
  expect(edit(base, { category: 'feriado' }).category).toBe('feriado');
});

test('an unchanged reviewed deadline adjustment keeps its review', () => {
  const base = saved({
    requirementId: 'regular-admission-notice',
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
    ...eventValues(saved(), ['integrado']),
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
    offers: ['integrado', 'graduacao'],
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
  expect(eventValues(base, ['integrado']).admissionPeriodId).toBe('year');
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
  expect(eventValues(base, ['integrado']).admissionPeriodId).toBe(keptDestinations);
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
    eventValues(transfer([{ offerId: 'integrado', periodId: 'year' }]), ['integrado'])
      .admissionPeriodId,
  ).toBe(keptDestinations);
});
