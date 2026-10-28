import type { CalendarActivity } from '../src/domain/calendar/model.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { teacherVacations } from '../src/domain/calendar/activities/teacher-vacations.ts';

test('campus vacation intervals are flexible, counted inclusively, and reject overlap', () => {
  const v = teacherVacations(2027, {
    firstStart: '2027-03-01',
    firstEnd: '2027-03-20',
    secondStart: '2027-08-01',
    secondEnd: '2027-08-25',
  });
  assert.equal(v.total, 45);
  assert.equal(v.events[0].start, '2027-03-01');
  assert.throws(() =>
    teacherVacations(2027, {
      firstStart: '2027-03-01',
      firstEnd: '2027-03-20',
      secondStart: '2027-03-20',
      secondEnd: '2027-03-25',
    }),
  );
  assert.throws(() => teacherVacations(2027, { firstStart: '2027-03-01' }));
});

test('three campus intervals total 45 days and retain stable legacy IDs', () => {
  const input = {
    firstStart: '2027-01-02',
    firstEnd: '2027-01-16',
    secondStart: '2027-07-01',
    secondEnd: '2027-07-15',
    thirdStart: '2027-12-01',
    thirdEnd: '2027-12-15',
  };
  const v = teacherVacations(2027, input);
  assert.equal(v.total, 45);
  assert.equal(v.events.length, 3);
  assert.deepEqual(
    v.events.map((e: CalendarActivity) => e.id),
    ['teacher-vacation-january', 'teacher-vacation-july', 'teacher-vacation-third'],
  );
  assert.throws(() => teacherVacations(2027, { ...input, thirdStart: '2027-07-15' }), /sobrepor/);
  assert.throws(() => teacherVacations(2027, { ...input, thirdEnd: '' }), /início e término/);
  assert.throws(() => teacherVacations(2027, { ...input, thirdEnd: '2028-01-01' }), /ano/);
  const two = teacherVacations(2027, { ...input, thirdStart: '', thirdEnd: '' });
  assert.equal(two.events.length, 2);
  assert.equal(two.total, 30);
});
