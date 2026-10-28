/** Offline proof of first-use refresh rotation; never authorizes writes or credential replay. */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonical, fingerprint, hexDigest } from './administration/canonical.ts';

export type AuthRefreshRow = { _id: string; _creationTime: number; [key: string]: unknown };
type Tables = Record<string, AuthRefreshRow[]>;
const duration = 8 * 60 * 60 * 1000;
export const authRefreshPolicy = {
  version: 'auth-first-use-refresh-v1',
  package: '@convex-dev/auth',
  packageVersion: '0.0.96',
  sourceDigest: '47d86d6c4e8339f193ec24e8c9f43b171e816318cc960959c69fe5f73ea030ba',
  runtimeDigest: 'f20e4d8409d21660d486ea66da13e6db0d5aa1fb8843d798c1f929b90ca60a84',
  applicationConfigDigest: '06b72beef8d2d09a9222d0cfa504ffabcd678a6396988802bc96e1a927c49d06',
  inactiveDurationMs: duration,
  rule: 'only-exact-first-use-parent-timestamp-no-reuse-no-deletion',
} as const;
export const authRefreshPolicyDigest = fingerprint(authRefreshPolicy);
type TokenEntry = {
  idHash: string;
  full: string;
  stable: string;
  sessionHash: string;
  parentHash?: string;
  created: number;
  expiration: number;
  firstUsed?: number;
};
export type AuthRefreshManifest = {
  policyDigest: string;
  beforeHash: string;
  count: number;
  rows: TokenEntry[];
  /** Root Auth/user tables remain byte-for-byte equal independently of token reconciliation. */
  stableTables: Record<string, { count: number; hash: string }>;
};
export type AuthRefreshReport = {
  policyDigest: string;
  manifestDigest: string;
  namespace: 'authRefreshTokens';
  beforeHash: string;
  afterHash: string;
  beforeCount: number;
  afterCount: number;
  retainedStableBeforeHash: string;
  retainedStableAfterHash: string;
  inserted: number;
  firstUses: number;
  deleted: 0;
  changes: {
    idHash: string;
    parentHash?: string;
    beforeHash: string | null;
    afterHash: string;
    kind: 'inserted' | 'first-use';
  }[];
};
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const hashRows = (rows: AuthRefreshRow[]) => fingerprint(rows.map(canonical).sort());
const protectedNames = (tables: Tables) =>
  Object.keys(tables)
    .filter((name) => name === 'users' || (name.startsWith('auth') && name !== 'authRefreshTokens'))
    .sort();
function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(`Reconciliação Auth limitada recusada: ${message}.`);
}
const timestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
function entries(rows: AuthRefreshRow[]): TokenEntry[] {
  const ids = new Set<string>();
  return rows.map((row) => {
    requireValue(
      row &&
        text(row._id) &&
        Number.isFinite(row._creationTime) &&
        row._creationTime >= 0 &&
        text(row.sessionId) &&
        timestamp(row.expirationTime),
      'documento de token inválido',
    );
    requireValue(
      Object.keys(row).every((key) =>
        [
          '_id',
          '_creationTime',
          'sessionId',
          'expirationTime',
          'firstUsedTime',
          'parentRefreshTokenId',
        ].includes(key),
      ),
      'campo desconhecido em token',
    );
    requireValue(
      row.firstUsedTime === undefined || timestamp(row.firstUsedTime),
      'firstUsedTime inválido',
    );
    requireValue(
      row.parentRefreshTokenId === undefined || text(row.parentRefreshTokenId),
      'parent inválido',
    );
    requireValue(!ids.has(row._id), 'ID de token duplicado');
    ids.add(row._id);
    const { firstUsedTime: _firstUse, ...stable } = row;
    return {
      idHash: fingerprint(row._id),
      full: fingerprint(row),
      stable: fingerprint(stable),
      sessionHash: fingerprint(row.sessionId),
      created: row._creationTime,
      expiration: row.expirationTime,
      ...(row.parentRefreshTokenId === undefined
        ? {}
        : { parentHash: fingerprint(row.parentRefreshTokenId) }),
      ...(row.firstUsedTime === undefined ? {} : { firstUsed: row.firstUsedTime as number }),
    };
  });
}
export function createAuthRefreshManifest(tables: Tables): AuthRefreshManifest {
  const rows = tables.authRefreshTokens ?? [];
  return {
    policyDigest: authRefreshPolicyDigest,
    count: rows.length,
    beforeHash: hashRows(rows),
    rows: entries(rows),
    stableTables: Object.fromEntries(
      protectedNames(tables).map((name) => [
        name,
        { count: tables[name].length, hash: hashRows(tables[name]) },
      ]),
    ),
  };
}
/** Compatible with a narrowly defined SDK transition; exported data cannot prove the caller or token possession. */
export function reconcileAuthRefresh(
  manifest: AuthRefreshManifest,
  tables: Tables,
): AuthRefreshReport {
  requireValue(
    manifest.policyDigest === authRefreshPolicyDigest &&
      manifest.count === manifest.rows.length &&
      hexDigest(manifest.beforeHash),
    'manifesto/política divergente',
  );
  requireValue(
    canonical(Object.keys(manifest.stableTables).sort()) === canonical(protectedNames(tables)),
    'inventário das tabelas Auth/usuários mudou',
  );
  for (const [name, expected] of Object.entries(manifest.stableTables))
    requireValue(
      tables[name]?.length === expected.count && hashRows(tables[name]) === expected.hash,
      `tabela estável ${name} mudou`,
    );
  const original = new Map(manifest.rows.map((row) => [row.idHash, row]));
  requireValue(
    original.size === manifest.count &&
      manifest.rows.every(
        (row) =>
          hexDigest(row.idHash) &&
          hexDigest(row.full) &&
          hexDigest(row.stable) &&
          hexDigest(row.sessionHash),
      ),
    'manifesto de tokens inválido',
  );
  const rows = tables.authRefreshTokens ?? [],
    currentEntries = entries(rows);
  const current = new Map(currentEntries.map((row) => [row.idHash, row]));
  const acyclic = new Set<string>();
  function checkCycle(row: TokenEntry, visiting = new Set<string>()) {
    if (acyclic.has(row.idHash)) return;
    requireValue(!visiting.has(row.idHash), 'ciclo na cadeia completa de tokens');
    visiting.add(row.idHash);
    if (row.parentHash && current.has(row.parentHash))
      checkCycle(current.get(row.parentHash)!, visiting);
    visiting.delete(row.idHash);
    acyclic.add(row.idHash);
  }
  for (const row of currentEntries) checkCycle(row);
  const sessions = new Map((tables.authSessions ?? []).map((row) => [fingerprint(row._id), row]));
  const changes: AuthRefreshReport['changes'] = [];
  const retainedBefore: [string, string][] = [],
    retainedAfter: [string, string][] = [];
  for (const before of manifest.rows) {
    const after = current.get(before.idHash);
    requireValue(after, 'remoção de token original');
    requireValue(before.stable === after.stable, 'campos estáveis de token original alterados');
    retainedBefore.push([before.idHash, before.stable]);
    retainedAfter.push([after.idHash, after.stable]);
    if (before.firstUsed !== undefined)
      requireValue(after.firstUsed === before.firstUsed, 'firstUsedTime original reescrito');
    else if (after.firstUsed !== undefined) {
      requireValue(
        after.firstUsed >= Math.floor(after.created) && after.firstUsed < after.expiration,
        'firstUsedTime fora da validade',
      );
      requireValue(
        currentEntries.some(
          (child) =>
            !original.has(child.idHash) &&
            child.parentHash === after.idHash &&
            Math.floor(child.created) === after.firstUsed,
        ),
        'primeiro uso sem filho novo correspondente',
      );
      changes.push({
        idHash: after.idHash,
        beforeHash: before.full,
        afterHash: after.full,
        kind: 'first-use',
      });
    }
  }
  const validated = new Set<string>();
  function validateInserted(row: TokenEntry, path = new Set<string>()) {
    if (original.has(row.idHash) || validated.has(row.idHash)) return;
    requireValue(!path.has(row.idHash), 'ciclo na cadeia de renovação');
    path.add(row.idHash);
    requireValue(row.parentHash && current.has(row.parentHash), 'novo token raiz/órfão');
    const parent = current.get(row.parentHash)!;
    requireValue(
      !original.has(parent.idHash) || original.get(parent.idHash)!.firstUsed === undefined,
      'pai original já usado: reuso fora da prova',
    );
    requireValue(
      parent.idHash !== row.idHash && parent.sessionHash === row.sessionHash,
      'pai de outra sessão',
    );
    requireValue(
      parent.firstUsed === Math.floor(row.created) &&
        row.created >= parent.created &&
        parent.firstUsed < parent.expiration,
      'filho não é renovação exata do primeiro uso',
    );
    requireValue(
      currentEntries.filter(
        (child) => child.parentHash === parent.idHash && !original.has(child.idHash),
      ).length === 1,
      'reuso/siblings fora da prova delimitada',
    );
    requireValue(
      row.expiration === Math.floor(row.created) + duration,
      'expiração nova diferente do SDK/configuração',
    );
    const session = sessions.get(row.sessionHash);
    requireValue(
      session &&
        timestamp(session.expirationTime) &&
        session.expirationTime > Math.floor(row.created),
      'nova sessão ou sessão expirada',
    );
    const user = (tables.users ?? []).find((candidate) => candidate._id === session.userId);
    requireValue(
      user?.active === true &&
        user.removedAt === undefined &&
        (session.generation ?? 0) === (user.sessionGeneration ?? 0),
      'sessão sem usuário ativo/generation preservada',
    );
    if (row.firstUsed !== undefined) {
      requireValue(
        row.firstUsed >= Math.floor(row.created) &&
          row.firstUsed < row.expiration &&
          currentEntries.some(
            (child) =>
              !original.has(child.idHash) &&
              child.parentHash === row.idHash &&
              Math.floor(child.created) === row.firstUsed,
          ),
        'novo token usado sem filho',
      );
    }
    validateInserted(parent, path);
    path.delete(row.idHash);
    validated.add(row.idHash);
    changes.push({
      idHash: row.idHash,
      parentHash: row.parentHash,
      beforeHash: null,
      afterHash: row.full,
      kind: 'inserted',
    });
  }
  for (const row of currentEntries) validateInserted(row);
  return {
    policyDigest: authRefreshPolicyDigest,
    manifestDigest: fingerprint(manifest),
    namespace: 'authRefreshTokens',
    beforeHash: manifest.beforeHash,
    afterHash: hashRows(rows),
    beforeCount: manifest.count,
    afterCount: rows.length,
    retainedStableBeforeHash: fingerprint(retainedBefore.sort(([a], [b]) => a.localeCompare(b))),
    retainedStableAfterHash: fingerprint(retainedAfter.sort(([a], [b]) => a.localeCompare(b))),
    inserted: validated.size,
    firstUses: changes.filter((row) => row.kind === 'first-use').length,
    deleted: 0,
    changes: changes.sort((a, b) => a.idHash.localeCompare(b.idHash)),
  };
}
/** Pin both the installed server implementation and the deployed application's 8h session configuration. */
export function assertAuthRefreshRuntime() {
  const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const packageRoot = realpathSync(join(appRoot, 'node_modules/@convex-dev/auth'));
  const info = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
    version: string;
  };
  requireValue(info.version === authRefreshPolicy.packageVersion, 'versão do SDK mudou');
  for (const [directory, extension, expected] of [
    ['src/server', '.ts', authRefreshPolicy.sourceDigest],
    ['dist/server', '.js', authRefreshPolicy.runtimeDigest],
  ] as const) {
    const files: string[] = [];
    const walk = (path: string) => {
      for (const item of readdirSync(path, { withFileTypes: true })) {
        const next = join(path, item.name);
        if (item.isDirectory()) walk(next);
        else if (item.name.endsWith(extension)) files.push(next);
      }
    };
    walk(join(packageRoot, directory));
    const inventory = files
      .sort()
      .map((path) => ({ path: relative(packageRoot, path), sha256: sha(readFileSync(path)) }));
    requireValue(sha(JSON.stringify(inventory)) === expected, 'fontes/runtime do SDK mudaram');
  }
  requireValue(
    sha(readFileSync(join(appRoot, 'convex/auth.ts'))) ===
      authRefreshPolicy.applicationConfigDigest,
    'configuração Auth da aplicação mudou',
  );
}
