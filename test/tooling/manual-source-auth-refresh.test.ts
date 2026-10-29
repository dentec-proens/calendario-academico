import { expect, test } from 'vitest';
import {
  assertAuthRefreshRuntime,
  createAuthRefreshManifest,
  reconcileAuthRefresh,
} from '../../scripts/auth-refresh-reconciliation.ts';
import type { AuthRefreshRow } from '../../scripts/auth-refresh-reconciliation.ts';
const duration = 28_800_000;
type Tables = Record<string, AuthRefreshRow[]>;
function baseline(): Tables {
  return {
    users: [{ _id: 'user-private', _creationTime: 1, active: true, sessionGeneration: 2 }],
    authSessions: [
      {
        _id: 'session-private',
        _creationTime: 1,
        userId: 'user-private',
        expirationTime: 100_000,
        generation: 2,
      },
    ],
    authAccounts: [
      {
        _id: 'account-private',
        _creationTime: 1,
        userId: 'user-private',
        secret: 'secret-unchanged',
      },
    ],
    authVerifiers: [],
    authRefreshTokens: [
      {
        _id: 'root-private',
        _creationTime: 1000.25,
        sessionId: 'session-private',
        expirationTime: 1000 + duration,
      },
    ],
  };
}
function rotation(chain = false): { before: Tables; after: Tables } {
  const before = baseline(),
    after = structuredClone(before);
  after.authRefreshTokens[0].firstUsedTime = 2000;
  after.authRefreshTokens.push({
    _id: 'child-private',
    _creationTime: 2000.75,
    sessionId: 'session-private',
    parentRefreshTokenId: 'root-private',
    expirationTime: 2000 + duration,
  });
  if (chain) {
    after.authRefreshTokens[1].firstUsedTime = 3000;
    after.authRefreshTokens.push({
      _id: 'grandchild-private',
      _creationTime: 3000.5,
      sessionId: 'session-private',
      parentRefreshTokenId: 'child-private',
      expirationTime: 3000 + duration,
    });
  }
  return { before, after };
}
test('first-use rotation and a new chain preserve stable data and emit only hashes', () => {
  const { before, after } = rotation(true),
    copy = structuredClone(before),
    manifest = createAuthRefreshManifest(before);
  const report = reconcileAuthRefresh(manifest, after);
  expect(before).toEqual(copy);
  expect(report.inserted).toBe(2);
  expect(report.firstUses).toBe(1);
  expect(report.retainedStableBeforeHash).toBe(report.retainedStableAfterHash);
  expect(report.beforeHash).not.toBe(report.afterHash);
  expect(report.manifestDigest).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify({ manifest, report })).not.toMatch(
    /root-private|session-private|child-private|user-private|secret-unchanged/,
  );
  expect(reconcileAuthRefresh(manifest, before).inserted).toBe(0);
  assertAuthRefreshRuntime();
});
test('retained token deletion, stable-field forgery and first-use invalidation are refused', () => {
  const mutations: ((rows: Tables) => void)[] = [
    (rows) => {
      rows.authRefreshTokens.shift();
    },
    (rows) => {
      rows.authRefreshTokens[0]._id = 'replacement';
    },
    (rows) => {
      rows.authRefreshTokens[0]._creationTime = 1001;
    },
    (rows) => {
      rows.authRefreshTokens[0].expirationTime = 1001 + duration;
    },
    (rows) => {
      rows.authRefreshTokens[0].sessionId = 'different';
    },
    (rows) => {
      rows.authRefreshTokens[0].parentRefreshTokenId = 'arbitrary';
    },
    (rows) => {
      rows.authRefreshTokens[0].firstUsedTime = 1999;
    },
    (rows) => {
      rows.authRefreshTokens[0].firstUsedTime = 999;
    },
    (rows) => {
      rows.authRefreshTokens[0].firstUsedTime = 1000 + duration;
    },
    (rows) => {
      rows.authRefreshTokens[0].extra = 'new-field';
    },
  ];
  for (const mutate of mutations) {
    const { before, after } = rotation();
    mutate(after);
    expect(() => reconcileAuthRefresh(createAuthRefreshManifest(before), after)).toThrow(
      /Auth limitada recusada/,
    );
  }
  const before = baseline();
  before.authRefreshTokens[0].firstUsedTime = 1100;
  const after = structuredClone(before);
  after.authRefreshTokens[0].firstUsedTime = 1200;
  expect(() => reconcileAuthRefresh(createAuthRefreshManifest(before), after)).toThrow(/reescrito/);
  delete after.authRefreshTokens[0].firstUsedTime;
  expect(() => reconcileAuthRefresh(createAuthRefreshManifest(before), after)).toThrow(/reescrito/);
});
test('new roots, orphans, cross-session children, expiry drift and siblings are refused', () => {
  const mutations: ((rows: Tables) => void)[] = [
    (rows) => {
      delete rows.authRefreshTokens[1].parentRefreshTokenId;
    },
    (rows) => {
      rows.authRefreshTokens[1].parentRefreshTokenId = 'missing';
    },
    (rows) => {
      rows.authRefreshTokens[1].sessionId = 'new-session';
    },
    (rows) => {
      rows.authRefreshTokens[1].expirationTime = 2001 + duration;
    },
    (rows) => {
      rows.authRefreshTokens[1]._creationTime = 2001.5;
    },
    (rows) => {
      rows.authRefreshTokens[1].firstUsedTime = 3000;
    },
    (rows) => {
      rows.authRefreshTokens[1].firstUsedTime = NaN;
    },
    (rows) => {
      rows.authRefreshTokens.push({ ...rows.authRefreshTokens[1], _id: 'sibling-private' });
    },
    (rows) => {
      rows.authRefreshTokens.push({ ...rows.authRefreshTokens[1] });
    },
    (rows) => {
      rows.authRefreshTokens[1].token = 'forged-raw-value';
    },
  ];
  for (const mutate of mutations) {
    const { before, after } = rotation();
    mutate(after);
    expect(() => reconcileAuthRefresh(createAuthRefreshManifest(before), after)).toThrow(
      /Auth limitada recusada/,
    );
  }
  const { before, after } = rotation();
  before.authRefreshTokens[0].firstUsedTime = 2000;
  expect(() => reconcileAuthRefresh(createAuthRefreshManifest(before), after)).toThrow(/já usado/);
});
test('cycles and a chain without any original root are refused', () => {
  const before = baseline(),
    after = structuredClone(before);
  for (const [id, parent] of [
    ['cycle-a', 'cycle-b'],
    ['cycle-b', 'cycle-a'],
  ])
    after.authRefreshTokens.push({
      _id: id,
      _creationTime: 2000.5,
      sessionId: 'session-private',
      parentRefreshTokenId: parent,
      expirationTime: 2000 + duration,
      firstUsedTime: 2000,
    });
  expect(() => reconcileAuthRefresh(createAuthRefreshManifest(before), after)).toThrow(/ciclo/);
});
test('Auth sessions, users, accounts and their table inventory remain completely strict', () => {
  const mutations: ((rows: Tables) => void)[] = [
    (rows) => {
      rows.users[0].active = false;
    },
    (rows) => {
      rows.users[0].sessionGeneration = 3;
    },
    (rows) => {
      rows.authSessions[0].expirationTime = 100_001;
    },
    (rows) => {
      rows.authSessions.push({ ...rows.authSessions[0], _id: 'new-session' });
    },
    (rows) => {
      rows.authAccounts[0].secret = 'changed';
    },
    (rows) => {
      delete rows.authVerifiers;
    },
    (rows) => {
      rows.authExtra = [];
    },
  ];
  for (const mutate of mutations) {
    const { before, after } = rotation();
    mutate(after);
    expect(() => reconcileAuthRefresh(createAuthRefreshManifest(before), after)).toThrow(/tabela/);
  }
});
test('a newly inserted chain requires a live matching generation of the preserved session', () => {
  for (const mutate of [
    (tables: Tables) => {
      tables.authSessions[0].expirationTime = 1999;
    },
    (tables: Tables) => {
      tables.users[0].active = false;
    },
    (tables: Tables) => {
      tables.users[0].removedAt = 1;
    },
    (tables: Tables) => {
      tables.users[0].sessionGeneration = 3;
    },
  ]) {
    const { before, after } = rotation();
    mutate(before);
    mutate(after);
    expect(() => reconcileAuthRefresh(createAuthRefreshManifest(before), after)).toThrow(
      /sessão|usuário/,
    );
  }
});

test('an inserted parent cannot close a cycle through an original orphan reference', () => {
  const { before, after } = rotation();
  before.authRefreshTokens[0].parentRefreshTokenId = 'child-private';
  after.authRefreshTokens[0].parentRefreshTokenId = 'child-private';
  expect(() => reconcileAuthRefresh(createAuthRefreshManifest(before), after)).toThrow(/ciclo/);
});
