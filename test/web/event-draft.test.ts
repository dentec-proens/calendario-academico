import { expect, test } from 'vitest';
import {
  eventFromValues,
  eventValues,
  type EventValues,
} from '../../web/features/calendar-editor/events/event-draft.ts';
import type { CalendarEvent } from '../../web/features/calendar-editor/types.ts';

const saved = (extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'saved',
  name: 'Registro salvo',
  start: '2027-05-10',
  end: '2027-05-10',
  kind: 'note',
  modalities: ['integrado'],
  ...extra,
});
const edit = (base: CalendarEvent, change: Partial<EventValues> = {}) =>
  eventFromValues({ ...eventValues(base, ['integrado']), ...change }, { id: base.id, base });

test('a record without category keeps it absent when only its link changes', () => {
  const base = saved({ kind: 'exclude' });
  expect(eventValues(base, ['integrado']).category).toBe('recesso');
  const result = edit(base, { requirementId: 'family-meeting' });
  expect(result.category).toBeUndefined();
  expect(result).toMatchObject({ kind: 'exclude', requirementId: 'family-meeting' });
  expect(edit(base, { category: 'feriado' }).category).toBe('feriado');
});

test('an unchanged reviewed deadline adjustment keeps its review', () => {
  const base = saved({
    requirementId: 'regular-admission-notice',
    publicationStatus: 'planned',
    admission: { type: 'regular', year: 2028, term: 'annual' },
    deadlineAdjustment: { date: '2027-07-01', reviewed: true },
  });
  expect(edit(base, { category: 'evento' }).deadlineAdjustment).toEqual({
    date: '2027-07-01',
    reviewed: true,
  });
  expect(edit(base, { adjustedDeadline: '2027-07-02' }).deadlineAdjustment).toEqual({
    date: '2027-07-02',
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
    publicationStatus: 'planned',
    admission: { type: 'transfer', year: 2027 },
  });
  const recess = eventFromValues(
    { ...values, eventType: 'recess', kind: 'exclude', category: 'recesso' },
    { id: 'new' },
  );
  expect(recess.admission).toBeUndefined();
  expect(recess.publicationStatus).toBeUndefined();
});
