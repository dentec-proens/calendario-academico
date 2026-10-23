import { readSnapshot, save } from './migrate-data.ts';
import { verifyCanonicalEquivalence } from '../migration/canonical.ts';
import { verifyComponents, assertCanonicalSnapshot } from './canonical-check.ts';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
async function main(): Promise<void> {
  const [beforePath, afterPath, baselinePath, reportPath] = process.argv.slice(2);
  if (!beforePath || !afterPath || !baselinePath || !reportPath)
    throw Error('Faltam backups, baseline e relatório.');
  const before = readSnapshot(beforePath),
    after = readSnapshot(afterPath);
  delete after.migrationState;
  assertCanonicalSnapshot(before, after);
  const structural = verifyCanonicalEquivalence(before, after);
  verifyComponents(beforePath, afterPath);
  const module = await import('../migration/canonical-baseline.ts');
  const report = await module.verifyBaselineEquivalence(before, after, resolve(baselinePath));
  save(reportPath, {
    result: 'verified',
    structural,
    runtime: report,
    checkedAt: new Date().toISOString(),
  });
  console.log('Equivalência de runtime verificada com código anterior arquivado.');
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Verificação interrompida.');
    process.exitCode = 1;
  });
