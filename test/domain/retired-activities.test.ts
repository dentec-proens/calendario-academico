import { expect, test } from 'vitest';
import {
  dropRetiredActivityDates,
  retiredActivities,
} from '../../src/domain/calendar/normalization/retired-activities.ts';
import { policyFor } from '../../src/domain/policies/registry.ts';

const linked = (id: string, activityId?: string) => ({
  id,
  ...(activityId ? { activity: { activityId } } : {}),
});

test('the 2027 policy retired the regular notice of the Processo Seletivo', () => {
  expect([...retiredActivities(policyFor(2027))]).toEqual(['regular-admission-notice']);
});

test('only dates linked to a retired activity leave, and a second pass changes nothing', () => {
  const retired = new Set(['regular-admission-notice']);
  const events = [
    linked('a', 'regular-admission-notice'),
    linked('b', 'admission-notice'),
    linked('c'),
  ];
  const kept = dropRetiredActivityDates(events, retired);
  expect(kept?.map((event) => event.id)).toEqual(['b', 'c']);
  expect(dropRetiredActivityDates(kept!, retired)).toBeUndefined();
});
