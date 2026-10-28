import { fingerprint, hexDigest } from './canonical';
export { canonical, fingerprint, hexDigest } from './canonical';
import { presencePolicyDigest } from './presenceLifecycle';
import type { PresenceManifest } from './presenceLifecycle';

export const cleanupTables = ['calendarContents', 'calendarSnapshots'] as const;
export type CleanupTable = (typeof cleanupTables)[number];
export type CleanupEntry = { id: string; before: string; after: string; removed: number };
export type CleanupBatch = { table: CleanupTable; entries: CleanupEntry[]; digest: string };
export type CleanupIdentity = {
  planDigest: string;
  presencePolicyDigest: string;
  backupSha256: string;
  schemaDigest: string;
  projectionDigest: string | null;
  commit: string;
};
export type CleanupReceipt = CleanupIdentity & {
  format: 1;
  operation: 'manual-sources';
  mode: 'rehearsal' | 'production';
  deploymentUrl: string;
  verifiedSnapshotSha256: string;
  removed: number;
  result: 'verified';
  presenceReportDigest: string;
  digest: string;
};
export type CleanupBatchArgs = CleanupIdentity & {
  table: CleanupTable;
  entries: CleanupEntry[];
  batchDigest: string;
  mode: 'rehearsal' | 'production';
  rehearsal?: CleanupReceipt;
};
export type CleanupBatchResult = {
  changed: number;
  removed: number;
  replayed: number;
  batchDigest: string;
};
export type CleanupPlan = {
  format: 1;
  operation: 'manual-sources';
  commit: string;
  backupSha256: string;
  schemaDigest: string;
  projectionDigest: string | null;
  tables: Record<string, { count: number; before: string; after: string }>;
  files: Record<string, { size: number; sha256: string }>;
  presence: PresenceManifest;
  batches: CleanupBatch[];
  removed: number;
  digest: string;
};
export function identity(plan: CleanupPlan): CleanupIdentity {
  return {
    planDigest: plan.digest,
    presencePolicyDigest: plan.presence.policyDigest,
    backupSha256: plan.backupSha256,
    schemaDigest: plan.schemaDigest,
    projectionDigest: plan.projectionDigest,
    commit: plan.commit,
  };
}
export function assertReceipt(receipt: CleanupReceipt, expected: CleanupIdentity) {
  if (
    !receipt ||
    receipt.format !== 1 ||
    receipt.operation !== 'manual-sources' ||
    receipt.result !== 'verified' ||
    !['rehearsal', 'production'].includes(receipt.mode) ||
    !hexDigest(receipt.verifiedSnapshotSha256) ||
    !hexDigest(receipt.presenceReportDigest) ||
    !Number.isSafeInteger(receipt.removed) ||
    receipt.removed < 0 ||
    fingerprint({ ...receipt, digest: '' }) !== receipt.digest ||
    Object.entries(expected).some(([key, value]) => Reflect.get(receipt, key) !== value)
  )
    throw Error('O recibo não comprova este plano, backup, schema, projeção e commit.');
}
export function assertCleanupPlan(plan: CleanupPlan) {
  if (
    !plan ||
    plan.format !== 1 ||
    plan.operation !== 'manual-sources' ||
    !/^[a-f0-9]{40}$/.test(plan.commit) ||
    !hexDigest(plan.backupSha256) ||
    !hexDigest(plan.schemaDigest) ||
    (plan.projectionDigest !== null && !hexDigest(plan.projectionDigest)) ||
    !Array.isArray(plan.batches) ||
    !plan.tables ||
    plan.presence?.policyDigest !== presencePolicyDigest ||
    !plan.files ||
    !Number.isSafeInteger(plan.removed) ||
    plan.removed < 0 ||
    fingerprint({ ...plan, digest: '' }) !== plan.digest
  )
    throw Error('Plano de limpeza adulterado ou incompleto.');
  let removed = 0;
  const ids = new Set<string>();
  for (const batch of plan.batches) {
    if (
      !cleanupTables.some((table) => table === batch.table) ||
      !batch.entries.length ||
      batch.entries.length > 10 ||
      fingerprint({ table: batch.table, entries: batch.entries }) !== batch.digest
    )
      throw Error('Lote fora do contrato de limpeza.');
    for (const entry of batch.entries) {
      const key = `${batch.table}:${entry.id}`;
      if (
        !entry.id ||
        ids.has(key) ||
        !hexDigest(entry.before) ||
        !hexDigest(entry.after) ||
        entry.before === entry.after ||
        !Number.isSafeInteger(entry.removed) ||
        entry.removed < 1
      )
        throw Error('Identidade, fingerprints ou contagem inválidos no plano.');
      ids.add(key);
      removed += entry.removed;
    }
  }
  if (removed !== plan.removed) throw Error('Contagem total do plano divergente.');
}
