import { documentTransition, createDocumentTransition } from '../web/app/updates/transition.ts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createVersionDetector,
  parseVersion,
  recentDifference,
} from '../web/app/updates/detector.ts';
import { recordAttempt } from '../web/app/updates/attempts.ts';
import { WorkProtection } from '../web/app/updates/work.ts';
import { FormDrafts } from '../web/shared/forms/drafts.tsx';

const manifest = (buildId: string) =>
  new Response(JSON.stringify({ schemaVersion: 1, buildId }), {
    headers: { 'Content-Type': 'application/json' },
  });
afterEach(() => vi.useRealTimers());

describe('frontend discovery', () => {
  it('deduplicates concurrent signals, throttles, recognizes rollback and retains last evidence on failure', async () => {
    let now = 100_000;
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(manifest('B'))
      .mockResolvedValueOnce(new Response('<html>', { headers: { 'Content-Type': 'text/html' } }))
      .mockResolvedValueOnce(manifest('A'));
    const detector = createVersionDetector('A', transport, () => now);
    const first = detector.check();
    expect(detector.check()).toBe(first);
    await first;
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledWith(
      '/version.json',
      expect.objectContaining({ cache: 'no-store', redirect: 'error' }),
    );
    expect(recentDifference(detector.getSnapshot(), now)).toBe(true);
    await detector.check();
    expect(transport).toHaveBeenCalledTimes(1);
    now += 15_000;
    await detector.check();
    expect(detector.getSnapshot()).toMatchObject({ observed: { buildId: 'B' }, failure: true });
    expect(recentDifference(detector.getSnapshot(), now)).toBe(false);
    await detector.check(true);
    expect(detector.getSnapshot()).toMatchObject({ observed: { buildId: 'A' }, failure: false });
    expect(recentDifference(detector.getSnapshot(), now)).toBe(false);
  });

  it('aborts slow checks and ignores an obsolete response even when transport ignores abort', async () => {
    vi.useFakeTimers();
    let complete!: (response: Response) => void;
    const transport = vi.fn<typeof fetch>().mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const detector = createVersionDetector('A', transport);
    const pending = detector.check();
    await vi.advanceTimersByTimeAsync(5000);
    expect(transport.mock.calls[0]![1]?.signal?.aborted).toBe(true);
    detector.dispose();
    complete(manifest('B'));
    await pending;
    expect(detector.getSnapshot().observed).toBeNull();
  });

  it('rejects invalid contracts and bounded responses, without treating errors as releases', async () => {
    for (const value of [
      '<html>',
      '{"schemaVersion":2,"buildId":"B"}',
      '{"schemaVersion":1,"buildId":"https://elsewhere"}',
      'x'.repeat(1025),
    ])
      expect(() => parseVersion(value)).toThrow();
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('x'.repeat(1025), { headers: { 'Content-Type': 'application/json' } }),
      );
    const detector = createVersionDetector('A', transport);
    await detector.check();
    expect(detector.getSnapshot()).toMatchObject({
      failure: true,
      observed: null,
      checking: false,
    });
    expect(
      recentDifference(
        { own: 'A', observed: { buildId: 'B', at: 0 }, checking: false, failure: false },
        30_001,
      ),
    ).toBe(false);
    expect(
      recentDifference(
        { own: 'B', observed: { buildId: 'A', at: 40_000 }, checking: false, failure: false },
        40_001,
      ),
    ).toBe(true);
  });
});

it('limits automatic attempts by target and time, without persisting user data or URLs', () => {
  let value: string | null = null;
  const storage = {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
  };
  expect(recordAttempt(storage, 'A', 'B', true, 100)).toBe(true);
  expect(recordAttempt(storage, 'A', 'B', true, 200)).toBe(false);
  expect(recordAttempt(storage, 'C', 'B', true, 200)).toBe(false);
  expect(recordAttempt(storage, 'A', 'B', false, 300)).toBe(true);
  expect(JSON.parse(value!)).toEqual([{ from: 'A', target: 'B', at: 300, count: 2 }]);
  expect(recordAttempt(storage, 'B', 'A', true, 400)).toBe(true);
  expect(recordAttempt(storage, 'A', 'B', true, 600_301)).toBe(true);
  expect(
    recordAttempt(
      {
        getItem: () => {
          throw new Error('Denied');
        },
        setItem() {},
      },
      'A',
      'B',
      true,
    ),
  ).toBe(false);
});

it('reads live owners synchronously and retains detached operations until their own completion', () => {
  const work = new WorkProtection();
  expect(work.getSnapshot()).toEqual([{ kind: 'initializing', loss: false }]);
  work.setReady(true);
  let dirty = false;
  const unregister = work.register(() => (dirty ? { kind: 'form', loss: true } : null));
  expect(work.getSnapshot()).toEqual([]);
  dirty = true; // No notification/effect is needed for the final authorization.
  expect(work.getSnapshot()).toEqual([{ kind: 'form', loss: true }]);
  const operation = work.begin()!;
  unregister();
  work.finish(Symbol());
  expect(work.getSnapshot()).toEqual([{ kind: 'operation', loss: true }]);
  work.finish(operation);
  expect(work.getSnapshot()).toEqual([]);
  const transition = documentTransition.begin()!;
  expect(work.begin()).toBeNull();
  expect(work.getSnapshot()).toEqual([]); // A transition itself never creates beforeunload loss.
  documentTransition.finish(transition);
});

it('publishes writes/clears, ignores filter preferences and preserves editing after submission', () => {
  const drafts = new FormDrafts('user-a');
  drafts.protection.setReady(true);
  const changed = vi.fn();
  drafts.subscribe(changed);
  drafts.write('filter', { year: 2028 }, false);
  expect(drafts.protection.getSnapshot()).toEqual([]);
  drafts.write('review', { notes: 'before' }, true, '/revisoes/calendar-a');
  const old = drafts.begin('review')!;
  drafts.write('review', { notes: 'after' }, true, '/revisoes/calendar-a');
  drafts.finish('review', old);
  expect(drafts.read('review', { notes: '' })).toEqual({ notes: 'after' });
  expect(drafts.protection.getSnapshot()).toEqual([
    { kind: 'form', loss: true, href: '/revisoes/calendar-a' },
  ]);
  const pending = drafts.begin('private')!;
  drafts.clearScope('review');
  expect(drafts.protection.getSnapshot()).toEqual([{ kind: 'operation', loss: true }]);
  drafts.finish('private', pending);
  expect(drafts.protection.getSnapshot()).toEqual([]);
  expect(changed).toHaveBeenCalledTimes(8);
});

it('field metadata cleanup on unmount does not make a confirmed submission look like a newer edit', () => {
  const drafts = new FormDrafts('user-a');
  drafts.protection.setReady(true);
  drafts.write('campus', {
    values: { name: 'Campus' },
    baseline: { name: '' },
    fieldMetaBase: { name: { isTouched: true } },
  });
  const operation = drafts.begin('campus')!;
  drafts.write('campus', { values: { name: 'Campus' }, baseline: { name: '' }, fieldMetaBase: {} });
  drafts.finish('campus', operation);
  expect(drafts.read('campus', { values: { name: '' } }).values.name).toBe('');
  expect(drafts.protection.getSnapshot()).toEqual([]);
});

it('closing a confirmation does not finalize its asynchronous action or a newer one', async () => {
  const { beginConfirmationOperation, hasPendingConfirmation } =
    await import('../web/components/confirmation.ts');
  const first = beginConfirmationOperation();
  const second = beginConfirmationOperation();
  first();
  first();
  expect(hasPendingConfirmation()).toBe(true);
  second();
  expect(hasPendingConfirmation()).toBe(false);
});

it('document transition survives owner replacement and only its current attempt may unlock', async () => {
  vi.useFakeTimers();
  const transition = createDocumentTransition();
  const first = transition.begin()!;
  const oldOwner = vi.fn();
  const unsubscribe = transition.subscribe(oldOwner);
  unsubscribe();
  const nextOwner = vi.fn();
  transition.subscribe(nextOwner);
  expect(transition.getSnapshot()).toMatchObject({ id: first, delayed: false });
  expect(transition.finish(Symbol())).toBe(false);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(transition.getSnapshot()).toMatchObject({ id: first, delayed: true });
  expect(nextOwner).toHaveBeenCalledOnce();
  transition.finish(first);
  const second = transition.begin()!;
  expect(transition.finish(first)).toBe(false);
  expect(transition.getSnapshot()?.id).toBe(second);
  transition.finish(second);
});

it('OAuth blocks updates while its own operation does not represent loss on intentional departure', () => {
  const work = new WorkProtection();
  work.setReady(true);
  const oauth = work.begin({ kind: 'access', loss: false })!;
  expect(work.getSnapshot()).toEqual([{ kind: 'access', loss: false }]);
  work.register(() => ({ kind: 'form', loss: true }));
  expect(work.getSnapshot().some((risk) => risk.loss)).toBe(true);
  work.finish(oauth);
  expect(work.getSnapshot()).toEqual([{ kind: 'form', loss: true }]);
});

it('a document returned to its origin suspends automatic recovery while success and third builds remain eligible', async () => {
  const { createAttemptPolicy } = await import('../web/app/updates/attempts.ts');
  let value: string | null = null;
  const storage = {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
  };
  recordAttempt(storage, 'A', 'B', true, 100);
  const origin = createAttemptPolicy(
    'A',
    () => storage,
    () => 200,
  );
  expect(origin.returnedToOrigin).toBe(true);
  expect(origin.record('C', true)).toBe(false);
  expect(origin.record('B', false)).toBe(true);
  expect(
    createAttemptPolicy(
      'B',
      () => storage,
      () => 300,
    ).returnedToOrigin,
  ).toBe(false);
  expect(
    createAttemptPolicy(
      'C',
      () => storage,
      () => 300,
    ).returnedToOrigin,
  ).toBe(false);
  expect(
    createAttemptPolicy(
      'A',
      () => storage,
      () => 600_201,
    ).returnedToOrigin,
  ).toBe(false);
});

it.each([{ builds: ['A', 'B', 'A'] }, { builds: ['A', 'B', 'C', 'A'] }])(
  'a successful rollback $builds is not mistaken for an old failed origin',
  async ({ builds }) => {
    const { createAttemptPolicy } = await import('../web/app/updates/attempts.ts');
    let value: string | null = null;
    const storage = {
      getItem: () => value,
      setItem: (_key: string, next: string) => {
        value = next;
      },
    };
    for (let index = 1; index < builds.length; index++)
      recordAttempt(storage, builds[index - 1]!, builds[index]!, true, index * 100);
    const policy = createAttemptPolicy(
      builds.at(-1)!,
      () => storage,
      () => 1000,
    );
    expect(policy.returnedToOrigin).toBe(false);
    expect(policy.record('D', true)).toBe(true);
  },
);
