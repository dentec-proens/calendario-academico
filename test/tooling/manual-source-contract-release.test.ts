import { expect, test } from 'vitest';
import { makeFunctionReference } from 'convex/server';
import { createNativeFixture } from '../helpers/native-database.ts';
import {
  contractManifest,
  contractProtectionHeaders,
  promoteContractCandidate,
  verifyContractSnapshot,
} from '../../scripts/release-manual-source-contract.ts';
import type { Snapshot } from '../../scripts/administration/snapshot.ts';
import schema from '../../convex/schema.ts';
import { fingerprint } from '../../scripts/administration/canonical.ts';
import { assertNoManualSources } from '../../scripts/release-manual-source-policy.ts';
const published = makeFunctionReference<'mutation'>('releases/contract:published');
const validated = makeFunctionReference<'mutation'>('releases/contract:validated');
const complete = makeFunctionReference<'mutation'>('releases/contract:complete');
const state = makeFunctionReference<'query', Record<string, never>, { schemaDigest: string }>(
  'releases/contract:state',
);
const commit = 'c'.repeat(40),
  previousBackend = 'b'.repeat(40),
  owner = 'a'.repeat(40);
async function fixture() {
  const f = await createNativeFixture();
  const schemaDigest = (await f.client.query(state, {})).schemaDigest;
  expect(schemaDigest).toBe(
    fingerprint(JSON.parse((schema as unknown as { export(): string }).export())),
  );
  await f.client.run(async (ctx) => {
    await ctx.db.insert('operationalControl', {
      key: 'release',
      paused: true,
      commit,
      changedAt: 1,
    });
    await ctx.db.insert('releaseProgress', {
      key: 'backend',
      mode: 'fast',
      commit: previousBackend,
      previousBackend,
      previousFrontend: 'dpl_previous',
      owner,
      candidateId: 'dpl_previous',
      functionSpecHash: 'd'.repeat(64),
      phase: 'complete',
      changedAt: 1,
      skippedValidations: { check: true, smoke: true, compatibility: true, backup: true },
    });
  });
  const args = {
    key: 'backend',
    mode: 'contract',
    phase: 'published',
    commit,
    previousBackend,
    previousFrontend: 'dpl_previous',
    owner,
    candidateId: 'dpl_candidate',
    functionSpecHash: 'd'.repeat(64),
    planDigest: 'e'.repeat(64),
    sourceDigest: 'f'.repeat(64),
    schemaDigest,
    rehearsalDigest: '1'.repeat(64),
    verificationDigest: '2'.repeat(64),
    changedAt: 1,
  };
  return { f, args };
}
test('contract completion requires validated exact candidate and remains idempotent', async () => {
  const { f, args } = await fixture();
  await f.client.mutation(published, args);
  await f.client.mutation(published, args);
  await expect(
    f.client.mutation(complete, { owner, candidateId: args.candidateId }),
  ).rejects.toThrow('validado');
  await f.client.mutation(validated, { owner, candidateId: args.candidateId });
  await f.client.mutation(validated, { owner, candidateId: args.candidateId });
  await f.client.mutation(complete, { owner, candidateId: args.candidateId });
  await f.client.mutation(complete, { owner, candidateId: args.candidateId });
  const rows = await f.client.run(async (ctx) => ({
    progress: await ctx.db.query('releaseProgress').take(10),
    receipts: await ctx.db.query('releaseReceipts').take(10),
  }));
  expect(rows.progress).toHaveLength(1);
  expect(rows.progress[0].phase).toBe('complete');
  expect(rows.receipts).toHaveLength(1);
  expect(rows.receipts[0]).toMatchObject({
    mode: 'contract',
    commit,
    candidateId: args.candidateId,
  });
});
test('resume transfers only the exact pending proof and revokes the previous owner', async () => {
  const { f, args } = await fixture();
  await f.client.mutation(published, args);
  const nextOwner = '3'.repeat(40);
  await expect(
    f.client.mutation(published, { ...args, owner: nextOwner, previousOwner: '4'.repeat(40) }),
  ).rejects.toThrow('proprietário');
  await expect(
    f.client.mutation(published, {
      ...args,
      owner: nextOwner,
      previousOwner: owner,
      verificationDigest: '5'.repeat(64),
    }),
  ).rejects.toThrow('mesmo código');
  await f.client.mutation(published, { ...args, owner: nextOwner, previousOwner: owner });
  await expect(
    f.client.mutation(validated, { owner, candidateId: args.candidateId }),
  ).rejects.toThrow('reserva');
  await f.client.mutation(validated, { owner: nextOwner, candidateId: args.candidateId });
});
test('smoke access and outstanding actions block contract receipts', async () => {
  const { f, args } = await fixture();
  await f.client.run(async (ctx) => {
    await ctx.db.insert('operationalLeases', { operation: 'pdf', startedAt: 1 });
  });
  await expect(f.client.mutation(published, args)).rejects.toThrow('drenagem');
});
function snapshot(): Snapshot {
  return {
    sha256: 'a'.repeat(64),
    files: {},
    tables: {
      _tables: [],
      _storage: [],
      calendarContents: [
        {
          _id: 'content',
          _creationTime: 1,
          state: { events: [], weekdays: [1] },
          institutionalSnapshot: [{ evidence: 'Norma institucional' }],
        },
      ],
      calendarSnapshots: [],
      users: [],
    },
  };
}
test('schema contract verification preserves all data and institutional references without an implicit source purge', () => {
  const source = snapshot(),
    manifest = contractManifest(source, commit, 'b'.repeat(64));
  expect(verifyContractSnapshot(manifest, structuredClone(source))).toMatchObject({
    result: 'verified',
    states: 1,
  });
  const field = structuredClone(source);
  (field.tables.calendarContents[0].state as Record<string, unknown>).weekEvidence = '';
  expect(() => assertNoManualSources(field.tables)).toThrow('persistidos');
  const changed = structuredClone(source);
  changed.tables.calendarContents[0].institutionalSnapshot = [{ evidence: 'Outra norma' }];
  expect(() => verifyContractSnapshot(manifest, changed)).toThrow('Dados alterados');
  const bytes = structuredClone(source);
  bytes.files['unknown'] = { size: 1, sha256: 'c'.repeat(64) };
  expect(() => verifyContractSnapshot(manifest, bytes)).toThrow('Storage');
});

test('protected candidate preflight uses OIDC only after binding the immutable candidate', () => {
  const environment = {
    DENTEC_RELEASE_SMOKE_USER_ID: 'user',
    DENTEC_RELEASE_SMOKE_EMAIL: 'smoke@example.test',
    DENTEC_RELEASE_SMOKE_PASSWORD: 'password',
    DENTEC_RELEASE_SMOKE_CALENDAR_ID: 'calendar',
    VERCEL_OIDC_TOKEN: 'private-test-token',
  };
  expect(contractProtectionHeaders('https://candidate.vercel.app', environment)).toEqual({
    'x-vercel-trusted-oidc-idp-token': 'private-test-token',
  });
  expect(() => contractProtectionHeaders('https://external.example', environment)).toThrow(
    'imutável',
  );
});

test('resuming an acknowledged promotion confirms the same candidate without promoting again', async () => {
  const candidate = { id: 'dpl_candidate', url: 'https://candidate.vercel.app', commit },
    previous = { id: 'dpl_previous', url: 'https://previous.vercel.app', commit: previousBackend };
  let promotions = 0,
    confirmations = 0;
  const platform = {
    current: async () => candidate,
    assertCurrent: async (expected: typeof candidate) => {
      expect(expected).toEqual(candidate);
      confirmations++;
    },
    promote: async () => {
      promotions++;
    },
  };
  await promoteContractCandidate(platform, candidate, previous);
  expect(promotions).toBe(0);
  expect(confirmations).toBe(1);
  await expect(
    promoteContractCandidate(
      { ...platform, current: async () => ({ ...candidate, id: 'dpl_other' }) },
      candidate,
      previous,
    ),
  ).rejects.toThrow('dois deployments');
  await expect(
    promoteContractCandidate(
      { ...platform, current: async () => ({ ...candidate, commit: previousBackend }) },
      candidate,
      previous,
    ),
  ).rejects.toThrow('identidade');
  expect(promotions).toBe(0);
});
