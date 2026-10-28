import type { CalendarActivity } from '../src/domain/calendar/model.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { initialCatalogue, inheritedEvents } from '../src/domain/institution/catalogue.ts';
import {
  campusInstitutionalEvents,
  teacherDayId,
  validateTeacherDay,
  teacherDayWeek,
} from '../src/domain/institution/teacher-day.ts';
import { durationEnd } from '../src/domain/calendar/counting/duration.ts';

test('campus may choose every day of the Monday-to-Sunday week containing October 15', () => {
  assert.deepEqual(teacherDayWeek(2027), { start: '2027-10-11', end: '2027-10-17' });
  for (let day = 11; day <= 17; day++)
    assert.equal(validateTeacherDay(`2027-10-${day}`, 2027), `2027-10-${day}`);
  for (const date of ['2027-10-10', '2027-10-18', '2027-09-15'])
    assert.throws(() => validateTeacherDay(date, 2027), /semana de 15 de outubro/);
  assert.deepEqual(teacherDayWeek(2028), { start: '2028-10-09', end: '2028-10-15' });
  assert.equal(validateTeacherDay(undefined, 2027), undefined);
});

test('only teacher day moves; original date is restored and other calendars stay unchanged', () => {
  const catalogue = initialCatalogue(),
    base = inheritedEvents(catalogue, 2027, 'integrado');
  const moved = campusInstitutionalEvents(base, { year: 2027, teacherDayDate: '2027-10-13' });
  assert.equal(moved.find((e: CalendarActivity) => e.id === teacherDayId)!.start, '2027-10-13');
  assert.equal(moved.filter((e: CalendarActivity) => e.id === teacherDayId).length, 1);
  assert.deepEqual(
    moved.filter((e: CalendarActivity) => e.id !== teacherDayId),
    base.filter((e: CalendarActivity) => e.id !== teacherDayId),
  );
  assert.equal(base.find((e: CalendarActivity) => e.id === teacherDayId)!.start, '2027-10-15');
  assert.deepEqual(campusInstitutionalEvents(moved, { year: 2027 }), base);
  const state = {
    year: 2027,
    offer: 'integrado',
    modalities: ['integrado'],
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [],
    events: [],
  };
  assert.equal(durationEnd('2027-10-13', 1, state, base), '2027-10-13');
  assert.equal(durationEnd('2027-10-13', 1, state, moved), '2027-10-14');
  assert.equal(durationEnd('2027-10-15', 1, state, moved), '2027-10-15');
  assert.throws(() => validateTeacherDay('2028-10-13', 2027));
  assert.throws(() => validateTeacherDay('2027-02-30', 2027));
  assert.throws(() =>
    inheritedEvents(catalogue, 2028, 'integrado', { year: 2028, teacherDayDate: '2028-10-13' }),
  );
});
