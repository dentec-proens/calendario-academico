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
  offers: ['integrado'],
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

test('a deadline adjustment keeps its date until the form changes it', () => {
  const base = saved({
    activity: onceLink('regular-admission-notice'),
    notice: {
      publication: 'planned',
      admission: { type: 'regular', year: 2028, term: 'annual', destinations: [] },
    },
    deadlineAdjustment: { date: civilDate('2027-07-01') },
  });
  expect(edit(base, { category: 'evento' }).deadlineAdjustment).toEqual({
    date: civilDate('2027-07-01'),
  });
  expect(edit(base, { adjustedDeadline: '2027-07-02' }).deadlineAdjustment).toEqual({
    date: civilDate('2027-07-02'),
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

test('saving the date form saves the offers chosen in it, as listed', () => {
  const base = saved({
    offers: ['integrado', 'graduacao'],
  });
  // The form starts from the listed offers, never from the current ones.
  expect(eventValues(base).offers).toEqual(['integrado', 'graduacao']);
  expect(edit(base).offers).toEqual(['integrado', 'graduacao']);
  expect(edit(base, { offers: ['graduacao'] }).offers).toEqual(['graduacao']);
  // A new campus date starts with every offer of the calendar.
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
    ).offers,
  ).toEqual(['integrado', 'graduacao']);
});

test('the internal option (art. 18) is a form value: marking and unmarking keep ID, dates and offers', () => {
  const base = saved({ category: 'evento' });
  expect(eventValues(base).internal).toBe(false);
  const marked = edit(base, { internal: true });
  expect(marked).toMatchObject({
    id: base.id,
    start: base.start,
    end: base.end,
    offers: base.offers,
    internal: true,
  });
  const internal = { ...base, internal: true as const };
  expect(eventValues(internal).internal).toBe(true);
  const unmarked = edit(internal, { internal: false });
  expect(unmarked.internal).toBeUndefined();
  expect(unmarked).toMatchObject({ id: base.id, start: base.start, end: base.end });
  expect(emptyEvent(['integrado']).internal).toBe(false);
});
