import { expect, test, vi } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { convexToJson } from 'convex/values';
import {
  createPresenceManifest,
  reconcilePresence,
  presenceNamespaces,
} from '../../scripts/administration/presence-lifecycle.ts';
import type { LifecycleRow } from '../../scripts/administration/presence-lifecycle.ts';
import { assertPresenceRuntime } from '../../scripts/administration/presence-runtime.ts';
import { withTargetEnvFile } from '../../scripts/administration/cli-environment.ts';
const [presence, sessions, roomTokens, sessionTokens, workers, workerState] = presenceNamespaces;
function fixture(): Record<string, LifecycleRow[]> {
  return {
    [presence]: [
      {
        _id: 'p',
        _creationTime: 1,
        roomId: 'application',
        userId: 'u',
        online: true,
        lastDisconnected: 0,
        data: { retained: true },
      },
    ],
    [sessions]: [
      {
        _id: 's',
        _creationTime: 1,
        roomId: 'application',
        userId: 'u',
        sessionId: 'auth:00000000-0000-0000-0000-000000000000',
        deadline: 100,
      },
    ],
    [roomTokens]: [{ _id: 'r', _creationTime: 1, roomId: 'application', token: 'private-token' }],
    [sessionTokens]: [
      {
        _id: 't',
        _creationTime: 1,
        sessionId: 'auth:00000000-0000-0000-0000-000000000000',
        token: 'private-token',
      },
    ],
    [workers]: [
      {
        _id: 'w',
        _creationTime: 1,
        name: 'disconnect',
        workQuery: 'q',
        workerMutation: 'm',
        config: { debounceMs: 1000 },
        status: { kind: 'idle' },
        stateId: 'state',
      },
    ],
    [workerState]: [
      { _id: 'state', _creationTime: 1, generation: convexToJson(1n), lastWorkTs: 10 },
    ],
    users: [{ _id: 'u', _creationTime: 1, active: true }],
    authSessions: [{ _id: 'auth', _creationTime: 1, userId: 'u', expirationTime: 1000 }],
  };
}
test('presence reconciliation inventories exact changes and preserves stable data without exposing tokens', () => {
  const before = fixture(),
    after = structuredClone(before),
    manifest = createPresenceManifest(before);
  after[presence][0].online = false;
  after[presence][0].lastDisconnected = 200;
  after[sessions] = [];
  after[sessionTokens] = [];
  after[workers][0].status = { kind: 'running' };
  after[workerState][0].generation = convexToJson(2n);
  after[workerState][0].lastWorkTs = 20;
  const report = reconcilePresence(manifest, after);
  expect(report.find((row) => row.namespace === presence)?.updated).toBe(1);
  expect(report.find((row) => row.namespace === sessions)?.deleted).toBe(1);
  expect(report.every((row) => row.retainedBeforeHash === row.retainedAfterHash)).toBe(true);
  expect(JSON.stringify({ manifest, report })).not.toContain('private-token');
});
test('presence reconciliation rejects stable changes, administrative deletion/start-stop, and time regression', () => {
  const before = fixture(),
    manifest = createPresenceManifest(before);
  const mutations: ((rows: Record<string, LifecycleRow[]>) => void)[] = [
    (rows) => {
      rows[presence][0].data = { retained: false };
    },
    (rows) => {
      rows[sessions][0].userId = 'other';
    },
    (rows) => {
      rows[roomTokens][0].token = 'changed';
    },
    (rows) => {
      rows[workers][0].config = { debounceMs: 1 };
    },
    (rows) => {
      rows[workers][0].status = { kind: 'stopped' };
    },
    (rows) => {
      rows[workers][0].stateId = 'replacement';
    },
    (rows) => {
      rows[sessions][0].deadline = 99;
    },
    (rows) => {
      rows[workerState][0].generation = convexToJson(0n);
    },
    ...[presence, roomTokens, workers, workerState].map(
      (namespace) => (rows: Record<string, LifecycleRow[]>) => {
        rows[namespace] = [];
      },
    ),
    (rows) => {
      rows[sessionTokens] = [];
    },
  ];
  for (const mutate of mutations) {
    const rows = structuredClone(before);
    mutate(rows);
    expect(() => reconcilePresence(manifest, rows)).toThrow(/presença incompatível/);
  }
});
test('new sessions require the preserved active Auth identity', () => {
  const before = fixture(),
    manifest = createPresenceManifest(before),
    after = structuredClone(before);
  after[sessions].push({
    ...after[sessions][0],
    _id: 's2',
    _creationTime: 2,
    sessionId: 'auth:11111111-1111-1111-1111-111111111111',
  });
  expect(() => reconcilePresence(manifest, after)).not.toThrow();
  after[sessions][1].sessionId = 'other:11111111-1111-1111-1111-111111111111';
  expect(() => reconcilePresence(manifest, after)).toThrow(/Auth/);
});
test('isolated env-file contains only selected target, private permissions, and is removed even on failure', () => {
  const original = readFileSync('.env.local');
  let selected = '';
  vi.stubEnv('CONVEX_DEPLOYMENT', 'dev:unrelated');
  try {
    expect(() =>
      withTargetEnvFile({ url: 'http://127.0.0.1:3210', adminKey: 'private-key' }, (path) => {
        selected = path;
        const env = readFileSync(path, 'utf8');
        expect(env).toContain('CONVEX_SELF_HOSTED_ADMIN_KEY="private-key"');
        expect(env).not.toContain('CONVEX_DEPLOYMENT');
        expect(statSync(path).mode & 0o077).toBe(0);
        throw Error('test cleanup');
      }),
    ).toThrow('test cleanup');
  } finally {
    vi.unstubAllEnvs();
  }
  expect(existsSync(selected)).toBe(false);
  expect(readFileSync('.env.local')).toEqual(original);
  assertPresenceRuntime();
});

test('new workers with arbitrary function refs cannot enter the bounded window', () => {
  const before = fixture(),
    after = structuredClone(before);
  before[workers] = [];
  after[workers][0].workQuery = 'arbitrary-ref';
  expect(() => reconcilePresence(createPresenceManifest(before), after)).toThrow(
    /criação de worker/,
  );
});

test('real ZIP safe numeric int64 generations reconcile with exact bigint values', () => {
  const before = fixture(),
    after = structuredClone(before);
  before[workerState][0].generation = 2462;
  after[workerState][0].generation = 2463;
  expect(() => reconcilePresence(createPresenceManifest(before), after)).not.toThrow();
  after[workerState][0].generation = Number.MAX_SAFE_INTEGER + 1;
  expect(() => reconcilePresence(createPresenceManifest(before), after)).toThrow(/generation/);
  after[workerState][0].generation = 2461;
  expect(() => reconcilePresence(createPresenceManifest(before), after)).toThrow(/retrocedeu/);
});
