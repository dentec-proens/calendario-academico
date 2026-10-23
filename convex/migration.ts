import { v, getConvexSize } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { applyChanges } from './store';
import { encodeValue, decodeValue } from '../src/convex-codec.mjs';
import { encodedValue } from './schema';
import { entityTables } from './model';
import { canonicalJson } from '../src/migration-canonical.mjs';

const project = 'heqytxslokehuyrlxsza';
const target = 'https://oceanic-gazelle-652.convex.cloud';
const markerName = '_convexSourceMigration';
const clearTables = [
  ...entityTables,
  'authAccounts',
  'authSessions',
  'authRefreshTokens',
  'authVerificationCodes',
  'authVerifiers',
  'authRateLimits',
  'calendarVersions',
  'calendarSnapshots',
  'reviewVersions',
  'fileObjects',
  'nativeUploads',
  'nativeFileTickets',
  'scopeVersions',
  'rootFields',
  '_storage',
] as const;
type Context = MutationCtx | QueryCtx;

function guard() {
  if (
    process.env.CONVEX_CLOUD_URL !== target ||
    process.env.DENTEC_SOURCE_MIGRATION_ALLOWED !== project
  )
    throw Error('Migração permitida apenas no deployment isolado e explicitamente habilitado.');
}

async function marker(ctx: Context, digest: string) {
  guard();
  const row = await ctx.db
    .query('rootFields')
    .withIndex('by_name', (q) => q.eq('name', markerName))
    .unique();
  const value = row && decodeValue(row.value);
  if (!row || !value || value.digest !== digest)
    throw Error('Migração não iniciada ou snapshot de origem diferente.');
  return { row, value };
}

const progress = (value: any) => ({
  phase: value.phase,
  clearTable: value.clearTable,
  baseNext: value.baseNext,
  archivesNext: value.archivesNext,
  contentNext: value.contentNext,
  authNext: value.authNext,
  filesDone: Object.keys(value.uploaded).length,
  filesDeferred: value.manifest.deferredFiles || 0,
  verifyTable: value.verification?.tableIndex ?? 0,
});
const digestArg = { digest: v.string() };
const fingerprint = async (value: any) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value))),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');

export const begin = internalMutation({
  args: { digest: v.string(), backupDigest: v.string(), manifest: v.any() },
  returns: v.any(),
  handler: async (ctx, { digest, backupDigest, manifest }) => {
    guard();
    if (
      !/^[a-f0-9]{64}$/.test(digest) ||
      !/^[a-f0-9]{64}$/.test(backupDigest) ||
      manifest?.sourceProject !== project ||
      !Number.isSafeInteger(manifest.baseBatches) ||
      !Number.isSafeInteger(manifest.archiveBatches) ||
      !Number.isSafeInteger(manifest.calendarVersions) ||
      !Number.isSafeInteger(manifest.files) ||
      !Array.isArray(manifest.fileManifest) ||
      manifest.fileManifest.length !== manifest.files
    )
      throw Error('Manifesto de migração inválido.');
    const existing = await ctx.db
      .query('rootFields')
      .withIndex('by_name', (q) => q.eq('name', markerName))
      .unique();
    if (existing) {
      const value = decodeValue(existing.value);
      if (
        value.digest !== digest ||
        value.backupDigest !== backupDigest ||
        canonicalJson(value.manifest) !== canonicalJson(manifest)
      )
        throw Error(
          'Outra migração ou configuração já foi iniciada. Preserve o manifesto original para retomar.',
        );
      return progress(value);
    }
    const value = {
      digest,
      backupDigest,
      manifest,
      phase: 'clearing',
      clearTable: 0,
      baseNext: 0,
      archivesNext: 0,
      contentNext: 0,
      authNext: 0,
      uploaded: {},
      startedAt: Date.now(),
    };
    await ctx.db.insert('rootFields', { name: markerName, value: encodeValue(value) });
    return progress(value);
  },
});

export const status = internalQuery({
  args: digestArg,
  returns: v.any(),
  handler: async (ctx, { digest }) => progress((await marker(ctx, digest)).value),
});

export const clearBatch = internalMutation({
  args: digestArg,
  returns: v.any(),
  handler: async (ctx, { digest }) => {
    const { row, value } = await marker(ctx, digest);
    if (value.phase !== 'clearing') return progress(value);
    const table = clearTables[value.clearTable];
    if (!table) throw Error('Etapa de limpeza inválida.');
    if (table === '_storage') {
      const rows = await ctx.db.system.query('_storage').take(100);
      for (const item of rows) await ctx.storage.delete(item._id);
      if (rows.length < 100) value.clearTable++;
    } else {
      const rows = await ctx.db.query(table as any).take(100);
      for (const item of rows)
        if (table !== 'rootFields' || item._id !== row._id) await ctx.db.delete(item._id);
      const remaining = await ctx.db.query(table as any).take(table === 'rootFields' ? 2 : 1);
      if (!remaining.some((item) => item._id !== row._id)) value.clearTable++;
    }
    if (value.clearTable === clearTables.length) value.phase = 'base';
    await ctx.db.patch(row._id, { value: encodeValue(value) });
    return progress(value);
  },
});

export const appendBase = internalMutation({
  args: { ...digestArg, index: v.number(), changes: v.any() },
  returns: v.any(),
  handler: async (ctx, { digest, index, changes }) => {
    const { row, value } = await marker(ctx, digest);
    if (index < value.baseNext) return progress(value);
    if (
      value.phase !== 'base' ||
      index !== value.baseNext ||
      index >= value.manifest.baseBatches ||
      !Array.isArray(changes) ||
      getConvexSize(changes) > 700_000
    )
      throw Error('Lote de dados fora da sequência ou limite.');
    if (
      changes.some(
        (change) =>
          !value.manifest.rootNames.includes(change.field) ||
          change.field === markerName ||
          change.removeRoot ||
          change.deleteKeys?.length,
      )
    )
      throw Error('Coleção de migração inválida.');
    await applyChanges(ctx, changes, { full: true });
    value.baseNext++;
    if (value.baseNext === value.manifest.baseBatches) value.phase = 'archives';
    await ctx.db.patch(row._id, { value: encodeValue(value) });
    return progress(value);
  },
});

export const appendArchives = internalMutation({
  args: {
    ...digestArg,
    index: v.number(),
    versions: v.array(
      v.object({
        calendarId: v.string(),
        ordinal: v.number(),
        metadata: encodedValue,
        snapshot: encodedValue,
      }),
    ),
  },
  returns: v.any(),
  handler: async (ctx, { digest, index, versions }) => {
    const { row, value } = await marker(ctx, digest);
    if (index < value.archivesNext) return progress(value);
    if (
      value.phase !== 'archives' ||
      index !== value.archivesNext ||
      index >= value.manifest.archiveBatches ||
      versions.length > 15 ||
      getConvexSize(versions) > 700_000
    )
      throw Error('Lote de versões fora da sequência ou limite.');
    for (const version of versions) {
      if (
        !Number.isSafeInteger(version.ordinal) ||
        version.ordinal < 0 ||
        getConvexSize(version.snapshot) > 800_000
      )
        throw Error('Versão inválida.');
      const calendar = await ctx.db
        .query('calendars')
        .withIndex('by_appId', (q) => q.eq('appId', version.calendarId))
        .unique();
      if (!calendar || (calendar.versionCount || 0) !== version.ordinal)
        throw Error('Versões de calendário devem ser contíguas.');
      const snapshotId = await ctx.db.insert('calendarSnapshots', { value: version.snapshot });
      await ctx.db.insert('calendarVersions', {
        ownerId: calendar.key,
        ordinal: version.ordinal,
        metadata: version.metadata,
        snapshotId,
      });
      await ctx.db.patch(calendar._id, { versionCount: version.ordinal + 1 });
    }
    value.archivesNext++;
    if (value.archivesNext === value.manifest.archiveBatches) value.phase = 'files';
    await ctx.db.patch(row._id, { value: encodeValue(value) });
    return progress(value);
  },
});

export const prepareFiles = internalMutation({
  args: digestArg,
  returns: v.any(),
  handler: async (ctx, { digest }) => {
    const { row, value } = await marker(ctx, digest);
    if (value.phase === 'archives' && value.manifest.archiveBatches === 0) {
      value.phase = 'files';
      await ctx.db.patch(row._id, { value: encodeValue(value) });
    }
    return progress(value);
  },
});

export const fileStatus = internalQuery({
  args: { ...digestArg, path: v.string(), sha256: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { digest, path, sha256 }) => {
    const { value } = await marker(ctx, digest);
    const saved = value.uploaded[path];
    if (saved && saved.sha256 !== sha256)
      throw Error('Arquivo alterado após o início da migração.');
    return !!saved;
  },
});

export const uploadUrl = internalMutation({
  args: digestArg,
  returns: v.string(),
  handler: async (ctx, { digest }) => {
    const { value } = await marker(ctx, digest);
    if (value.phase !== 'files') throw Error('A etapa de arquivos ainda não está disponível.');
    return ctx.storage.generateUploadUrl();
  },
});

export const registerFile = internalMutation({
  args: {
    ...digestArg,
    path: v.string(),
    sha256: v.string(),
    size: v.number(),
    storageId: v.id('_storage'),
  },
  returns: v.any(),
  handler: async (ctx, { digest, path, sha256, size, storageId }) => {
    const { row, value } = await marker(ctx, digest);
    if (value.uploaded[path]) {
      if (value.uploaded[path].sha256 !== sha256)
        throw Error('Arquivo alterado após o início da migração.');
      return progress(value);
    }
    if (
      value.phase !== 'files' ||
      !/^[a-f0-9]{64}$/.test(sha256) ||
      !path ||
      path.startsWith('/') ||
      path.split('/').some((p) => !p || p === '.' || p === '..') ||
      Object.keys(value.uploaded).length >= value.manifest.files
    )
      throw Error('Arquivo de migração inválido.');
    const expected = value.manifest.fileManifest.find((item: any) => item.path === path);
    const metadata = await ctx.db.system.get(storageId);
    if (
      !expected ||
      expected.size !== size ||
      (expected.sha256 && expected.sha256 !== sha256) ||
      !metadata ||
      metadata.size !== size
    )
      throw Error('Arquivo importado diverge da origem.');
    const prior = await ctx.db
      .query('fileObjects')
      .withIndex('by_path', (q) => q.eq('path', path))
      .unique();
    if (prior) throw Error('Caminho de arquivo já cadastrado.');
    await ctx.db.insert('fileObjects', { path, storageId });
    value.uploaded[path] = { sha256, size };
    await ctx.db.patch(row._id, { value: encodeValue(value) });
    return progress(value);
  },
});

export const verify = internalMutation({
  args: digestArg,
  returns: v.any(),
  handler: async (ctx, { digest }) => {
    const { row, value } = await marker(ctx, digest);
    if (
      !['files', 'verifying', 'verified', 'complete'].includes(value.phase) ||
      Object.keys(value.uploaded).length !== value.manifest.files
    )
      throw Error('A importação ainda possui etapas pendentes.');
    if (value.phase === 'verified' || value.phase === 'complete')
      return {
        ...progress(value),
        counts: value.verification.counts,
        expectedAccounts: value.manifest.expectedAccounts,
      };
    const tables = [
      ...Object.entries(value.manifest.counts),
      ['calendarVersions', value.manifest.calendarVersions],
      ['calendarSnapshots', value.manifest.calendarVersions],
      ['reviewVersions', value.manifest.reviewVersions],
      ['fileObjects', value.manifest.files],
    ];
    value.phase = 'verifying';
    value.verification ??= { tableIndex: 0, cursor: null, total: 0, counts: {} };
    const check = value.verification;
    const [table, expected] = tables[check.tableIndex];
    if (
      ![
        ...entityTables,
        'calendarVersions',
        'calendarSnapshots',
        'reviewVersions',
        'fileObjects',
      ].includes(table as any) ||
      !Number.isSafeInteger(expected) ||
      Number(expected) > 5000
    )
      throw Error('Contagem esperada inválida.');
    const page = await ctx.db.query(table as any).paginate({ cursor: check.cursor, numItems: 50 });
    check.total += page.page.length;
    check.cursor = page.continueCursor;
    if (check.total > Number(expected)) throw Error('Contagem importada diverge da origem.');
    if (page.isDone) {
      if (check.total !== Number(expected)) throw Error('Contagem importada diverge da origem.');
      check.counts[table as string] = check.total;
      check.tableIndex++;
      check.cursor = null;
      check.total = 0;
      if (check.tableIndex === tables.length) value.phase = 'verified';
    }
    await ctx.db.patch(row._id, { value: encodeValue(value) });
    return {
      ...progress(value),
      counts: check.counts,
      expectedAccounts: value.manifest.expectedAccounts,
    };
  },
});

export const verifyContent = internalMutation({
  args: { ...digestArg, index: v.number(), checks: v.array(v.any()) },
  returns: v.any(),
  handler: async (ctx, { digest, index, checks }) => {
    const { row, value } = await marker(ctx, digest);
    if (index < value.contentNext) return progress(value);
    if (
      !['files', 'verifying', 'verified'].includes(value.phase) ||
      index !== value.contentNext ||
      index >= value.manifest.contentBatches ||
      checks.length > 50
    )
      throw Error('Conferência de conteúdo fora da sequência.');
    for (const check of checks) {
      if (check.kind === 'root') {
        const root = await ctx.db
          .query('rootFields')
          .withIndex('by_name', (q) => q.eq('name', check.field))
          .unique();
        if (!root || (await fingerprint(root.value)) !== check.hash)
          throw Error('Conteúdo de coleção diverge da origem.');
      } else if (check.kind === 'entity') {
        if (!entityTables.includes(check.field)) throw Error('Coleção de conferência inválida.');
        const entity = await ctx.db
          .query(check.field as any)
          .withIndex('by_key', (q: any) => q.eq('key', check.key))
          .unique();
        if (!entity || entity.position !== check.position)
          throw Error('Identidade ou ordem diverge da origem.');
        let expectedValue = entity.value;
        if (check.field === 'reviews') {
          const review = decodeValue(entity.value);
          if (Object.hasOwn(review, 'history')) {
            const versions = await ctx.db
              .query('reviewVersions')
              .withIndex('by_ownerId_and_ordinal', (q) => q.eq('ownerId', entity.key))
              .take(5001);
            if (versions.length > 5000) throw Error('Limite de histórico excedido.');
            review.history = versions.map((version) => decodeValue(version.value));
            expectedValue = encodeValue(review);
          }
        }
        if ((await fingerprint(expectedValue)) !== check.hash)
          throw Error('Conteúdo de registro diverge da origem.');
      } else if (check.kind === 'archive') {
        const calendar = await ctx.db
          .query('calendars')
          .withIndex('by_appId', (q) => q.eq('appId', check.calendarId))
          .unique();
        if (!calendar) throw Error('Calendário de versão ausente.');
        const version = await ctx.db
          .query('calendarVersions')
          .withIndex('by_ownerId_and_ordinal', (q) =>
            q.eq('ownerId', calendar.key).eq('ordinal', check.ordinal),
          )
          .unique();
        const snapshot = version && (await ctx.db.get(version.snapshotId));
        if (
          !version ||
          !snapshot ||
          (await fingerprint(version.metadata)) !== check.metadataHash ||
          (await fingerprint(snapshot.value)) !== check.snapshotHash
        )
          throw Error('Snapshot ou metadados de versão divergem da origem.');
      } else throw Error('Tipo de conferência inválido.');
    }
    value.contentNext++;
    await ctx.db.patch(row._id, { value: encodeValue(value) });
    return progress(value);
  },
});

export const verifyAuth = internalMutation({
  args: {
    ...digestArg,
    index: v.number(),
    checks: v.array(
      v.object({ appId: v.string(), hash: v.string(), secretHash: v.union(v.string(), v.null()) }),
    ),
  },
  returns: v.any(),
  handler: async (ctx, { digest, index, checks }) => {
    const { row, value } = await marker(ctx, digest);
    if (index < value.authNext) return progress(value);
    if (
      value.phase !== 'verified' ||
      value.contentNext !== value.manifest.contentBatches ||
      index !== value.authNext ||
      index >= value.manifest.authBatches ||
      checks.length > 50
    )
      throw Error('Conferência de credenciais fora da sequência.');
    for (const check of checks) {
      const user = await ctx.db
        .query('users')
        .withIndex('by_appId', (q) => q.eq('appId', check.appId))
        .unique();
      if (!user || (await fingerprint(user.value)) !== check.hash)
        throw Error('Perfil migrado diverge da origem.');
      const account = await ctx.db
        .query('authAccounts')
        .withIndex('userIdAndProvider', (q) => q.eq('userId', user._id).eq('provider', 'password'))
        .unique();
      if (check.secretHash === null) {
        if (account) throw Error('Credencial não autorizada encontrada.');
      } else if (!account?.secret || (await fingerprint(account.secret)) !== check.secretHash)
        throw Error('Credencial migrada diverge da origem.');
    }
    value.authNext++;
    await ctx.db.patch(row._id, { value: encodeValue(value) });
    return progress(value);
  },
});

export const finish = internalMutation({
  args: digestArg,
  returns: v.any(),
  handler: async (ctx, { digest }) => {
    const { row, value } = await marker(ctx, digest);
    if (
      !['verified', 'complete'].includes(value.phase) ||
      value.contentNext !== value.manifest.contentBatches ||
      value.authNext !== value.manifest.authBatches
    )
      throw Error('Confira os dados e credenciais antes de concluir.');
    const accounts = await ctx.db.query('authAccounts').take(value.manifest.expectedAccounts + 1);
    if (accounts.length !== value.manifest.expectedAccounts)
      throw Error('Contagem de credenciais migradas diverge da origem.');
    value.phase = 'complete';
    value.completedAt = Date.now();
    await ctx.db.patch(row._id, { value: encodeValue(value) });
    return { ...progress(value), accounts: accounts.length };
  },
});
