import { civilDate } from '../../src/domain/civil-date.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { teacherVacations } from '../../src/domain/calendar/activities/teacher-vacations.ts';

test('campus vacation intervals are flexible, counted inclusively, and reject overlap', () => {
  const v = teacherVacations(2027, {
    firstStart: civilDate('2027-03-01'),
    firstEnd: civilDate('2027-03-20'),
    secondStart: civilDate('2027-08-01'),
    secondEnd: civilDate('2027-08-25'),
  });
  assert.equal(v.total, 45);
  assert.equal(v.events[0].start, '2027-03-01');
  assert.throws(() =>
    teacherVacations(2027, {
      firstStart: civilDate('2027-03-01'),
      firstEnd: civilDate('2027-03-20'),
      secondStart: civilDate('2027-03-20'),
      secondEnd: civilDate('2027-03-25'),
    }),
  );
  assert.throws(() => teacherVacations(2027, { firstStart: civilDate('2027-03-01') }));
});

test('three campus intervals total 45 days and retain stable legacy IDs', () => {
  const input = {
    firstStart: civilDate('2027-01-02'),
    firstEnd: civilDate('2027-01-16'),
    secondStart: civilDate('2027-07-01'),
    secondEnd: civilDate('2027-07-15'),
    thirdStart: civilDate('2027-12-01'),
    thirdEnd: civilDate('2027-12-15'),
  };
  const v = teacherVacations(2027, input);
  assert.equal(v.total, 45);
  assert.equal(v.events.length, 3);
  assert.deepEqual(
    v.events.map((e) => e.id),
    ['teacher-vacation-january', 'teacher-vacation-july', 'teacher-vacation-third'],
  );
  assert.throws(
    () => teacherVacations(2027, { ...input, thirdStart: civilDate('2027-07-15') }),
    /sobrepor/,
  );
  assert.throws(
    () => teacherVacations(2027, { ...input, thirdEnd: undefined }),
    /início e término/,
  );
  assert.throws(
    () => teacherVacations(2027, { ...input, thirdEnd: civilDate('2028-01-01') }),
    /ano/,
  );
  const two = teacherVacations(2027, { ...input, thirdStart: undefined, thirdEnd: undefined });
  assert.equal(two.events.length, 2);
  assert.equal(two.total, 30);
});
