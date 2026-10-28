import { expect, test } from 'vitest';
import { activityStatus } from '../src/domain/calendar/activities/status.ts';

const row = (
  applicability: 'required' | 'optional' | 'unconfigured',
  coverage: 'pending' | 'partial' | 'complete',
  issues: string[] = [],
) => ({ applicability, coverage, issues, warnings: [] });

test('required offers decide the activity status', () => {
  expect(activityStatus([row('required', 'complete')]).status).toBe('complete');
  expect(activityStatus([row('required', 'pending')]).status).toBe('pending');
  expect(activityStatus([row('required', 'partial')]).status).toBe('partial');
  // One completed offer does not hide another required offer still pending.
  expect(activityStatus([row('required', 'complete'), row('required', 'pending')]).status).toBe(
    'partial',
  );
  expect(activityStatus([row('required', 'pending'), row('optional', 'complete')]).status).toBe(
    'pending',
  );
});

test('activities without required offers are optional or await confirmation', () => {
  expect(activityStatus([row('optional', 'complete')]).status).toBe('optional');
  expect(activityStatus([row('optional', 'pending'), row('unconfigured', 'pending')]).status).toBe(
    'unconfigured',
  );
  expect(activityStatus([]).status).toBe('optional');
});

test('open applications, divergent offers and problems are reported beside the status', () => {
  const mixed = activityStatus([row('required', 'complete'), row('unconfigured', 'pending')]);
  expect(mixed).toMatchObject({ status: 'complete', toConfirm: 1, diverges: true });
  expect(activityStatus([row('required', 'pending'), row('required', 'pending')])).toMatchObject({
    diverges: false,
    problems: false,
  });
  expect(activityStatus([row('required', 'pending', ['Informe a fonte.'])]).problems).toBe(true);
});
