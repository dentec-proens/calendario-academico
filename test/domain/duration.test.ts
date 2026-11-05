import { test } from 'vitest';
import assert from 'node:assert/strict';
import { durationEnd } from '../../src/domain/calendar/counting/duration.ts';

test('inclusive vacation duration crosses months and leap day', () => {
  assert.equal(durationEnd('2027-01-02', 30), '2027-01-31');
  assert.equal(durationEnd('2028-02-20', 15), '2028-03-05');
  assert.throws(() => durationEnd('2027-01-02', 0));
  assert.throws(() => durationEnd('2027-02-30', 30));
});
