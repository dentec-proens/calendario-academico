import { expect, test } from 'vitest';
import { inspect, reconcile, reviewIsCurrent } from '../../src/domain/calendar/base.ts';

const scope = {
  year: 2027,
  offers: [
    {
      id: 'integrado',
      kind: 'integrado' as const,
      delivery: 'a-conferir' as const,
      organization: 'anual' as const,
    },
  ],
};
const event = {
  id: 'e',
  name: 'Feriado',
  start: '2027-04-01',
  end: '2027-04-01',
  kind: 'exclude',
  evidence: 'Portaria',
  modalities: ['integrado', 'graduacao'],
};
const document = {
  id: 'd',
  year: 2027,
  type: 'norma',
  title: 'Norma',
  source: 'PROENS',
  hash: 'abc',
  filename: 'norma.pdf',
};
const snapshot = { revision: 1, events: [event], documents: [document] };

test('equivalent revisions ignore ordering, operational metadata and offers outside the calendar', () => {
  const current = {
    revision: 3,
    events: [{ ...event, modalities: ['integrado'], active: true }],
    documents: [{ ...document, storageId: 'other', publishedAt: 'now' }],
  };
  const result = inspect(snapshot, current, scope);
  expect(result.kind).toBe('equivalent');
  expect(reconcile(result)).toEqual({ incorporate: false, recalculate: false });
  expect(result.identity).toBe(inspect(snapshot, snapshot, scope).identity);
});
test('document changes require confirmation without recalculating dates', () => {
  const result = inspect(
    snapshot,
    { ...snapshot, documents: [{ ...document, hash: 'new' }] },
    scope,
  );
  expect(result.kind).toBe('documents');
  expect(() => reconcile(result)).toThrow('incorpore');
  expect(reconcile(result, result.identity)).toEqual({ incorporate: true, recalculate: false });
});
test('event changes are identified even at the same revision and stale acceptance cannot incorporate them', () => {
  const result = inspect(
    snapshot,
    { ...snapshot, events: [{ ...event, start: '2027-04-02' }] },
    scope,
  );
  expect(result.kind).toBe('events');
  expect(() => reconcile(result, inspect(snapshot, snapshot, scope).identity)).toThrow('novamente');
  expect(reconcile(result, result.identity).recalculate).toBe(true);
});
test('campus adjustments do not manufacture institutional changes', () => {
  const previous = {
    ...snapshot,
    events: [
      {
        ...event,
        originalStart: event.start,
        originalEnd: event.end,
        start: '2027-04-02',
        end: '2027-04-02',
      },
    ],
  };
  expect(inspect(previous, snapshot, scope).compatible).toBe(true);
});
test('human reviews follow evidenced content; legacy reviews conservatively follow their original revision', () => {
  const identity = inspect(snapshot, snapshot, scope).identity;
  expect(
    reviewIsCurrent({ calendarVersion: 1, catalogueRevision: 1, baseIdentity: identity }, 1, {
      revision: 3,
      identity,
    }),
  ).toBe(true);
  expect(
    reviewIsCurrent({ calendarVersion: 1, catalogueRevision: 1 }, 1, { revision: 3, identity }),
  ).toBe(false);
  expect(
    reviewIsCurrent({ calendarVersion: 1, catalogueRevision: 1, baseIdentity: identity }, 2, {
      revision: 3,
      identity,
    }),
  ).toBe(false);
});

test('2027 rules adoption is explicit and invalidates reviews without changing dates', () => {
  const rulesetVersion = 'consup-292-2027-v1';
  const result = inspect(snapshot, { ...snapshot, rulesetVersion }, scope);
  expect(result.kind).toBe('rules');
  expect(result.compatible).toBe(false);
  expect(result.rules).toMatchObject({ before: undefined, after: rulesetVersion, changed: true });
  expect(result.rules.changes.map((change) => change.version)).toEqual([rulesetVersion]);
  expect(reconcile(result, result.identity)).toEqual({ incorporate: true, recalculate: false });
  expect(result.identity).toMatch(/^base-v2:consup-292-2027-v1:/);
  const current = { revision: 1, identity: result.identity, rulesetVersion };
  const old = { calendarVersion: 1, catalogueRevision: 1, baseIdentity: result.identity };
  expect(reviewIsCurrent(old, 1, current)).toBe(false);
  expect(reviewIsCurrent({ ...old, rulesetVersion }, 1, current)).toBe(true);
  expect(
    inspect({ ...snapshot, rulesetVersion }, { ...snapshot, rulesetVersion }, scope).compatible,
  ).toBe(true);
});

test('a relaxing ruleset version keeps base identity and reviews made under the previous one', () => {
  const [before, after] = ['consup-292-2027-v1', 'consup-292-2027-v2'];
  const previous = inspect(snapshot, { ...snapshot, rulesetVersion: before }, scope);
  const result = inspect(
    { ...snapshot, rulesetVersion: before },
    { ...snapshot, rulesetVersion: after },
    scope,
  );
  expect(result.kind).toBe('current');
  expect(result.compatible).toBe(true);
  expect(result.rules.changed).toBe(false);
  expect(result.rules.changes).toMatchObject([{ version: after, effect: 'relaxes' }]);
  expect(result.identity).toBe(previous.identity);
  const review = {
    calendarVersion: 1,
    catalogueRevision: 1,
    baseIdentity: previous.identity,
    rulesetVersion: before,
  };
  expect(
    reviewIsCurrent(review, 1, { revision: 1, identity: result.identity, rulesetVersion: after }),
  ).toBe(true);
  expect(
    reviewIsCurrent({ ...review, rulesetVersion: 'consup-292-2027-v0' }, 1, {
      revision: 1,
      identity: result.identity,
      rulesetVersion: after,
    }),
  ).toBe(false);
});

test('legacy base identities remain stable for years without changed rules', () => {
  for (const year of [2026, 2028]) {
    const before = inspect(snapshot, snapshot, { ...scope, year });
    const after = inspect(
      snapshot,
      { ...snapshot, rulesetVersion: year === 2026 ? 'legacy-2026-v1' : 'unconfigured:2028' },
      { ...scope, year },
    );
    expect(after.identity).toBe(before.identity);
    expect(after.compatible).toBe(true);
  }
});
