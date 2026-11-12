import { expect, test } from 'vitest';
import { activitySituation } from '../../src/domain/calendar/activities/plan-evaluation.ts';

const row = (
  applicability: 'required' | 'optional' | 'unconfigured',
  coverage: 'pending' | 'partial' | 'complete',
  issues: string[] = [],
) => ({
  applicability,
  coverage,
  issues: issues.map((detail) => ({ check: 'month' as const, detail })),
  warnings: [],
});

test('required offers decide the activity status', () => {
  expect(activitySituation([row('required', 'complete')]).status).toBe('complete');
  expect(activitySituation([row('required', 'pending')]).status).toBe('pending');
  expect(activitySituation([row('required', 'partial')]).status).toBe('partial');
  // One completed offer does not hide another required offer still pending.
  expect(activitySituation([row('required', 'complete'), row('required', 'pending')]).status).toBe(
    'partial',
  );
  expect(activitySituation([row('required', 'pending'), row('optional', 'complete')]).status).toBe(
    'pending',
  );
});

test('activities without required offers are optional or await confirmation', () => {
  expect(activitySituation([row('optional', 'complete')]).status).toBe('optional');
  expect(
    activitySituation([row('optional', 'pending'), row('unconfigured', 'pending')]).status,
  ).toBe('unconfigured');
  expect(activitySituation([]).status).toBe('optional');
});

test('open applications, divergent offers and problems are reported beside the status', () => {
  const mixed = activitySituation([row('required', 'complete'), row('unconfigured', 'pending')]);
  expect(mixed).toMatchObject({ status: 'complete', toConfirm: 1, diverges: true });
  expect(activitySituation([row('required', 'pending'), row('required', 'pending')])).toMatchObject(
    {
      diverges: false,
      problems: false,
    },
  );
  expect(activitySituation([row('required', 'pending', ['Informe a fonte.'])]).problems).toBe(true);
});
