import { createHash } from 'node:crypto';
import { readFile, writeFile, chmod, mkdir } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { parseEnv } from 'node:util';
import {
  planSourceMigration,
  sourceProject,
  targetDeployment,
  targetUrl,
} from './lib/convex-source-plan.mjs';

const workspace = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const argument = (name) =>
  args.find((value) => value.startsWith(name + '='))?.slice(name.length + 1);
const sourcePath = resolve(
  argument('--source') ||
    resolve(workspace, 'backup-native-source/supabase-heqytxslokehuyrlxsza.json'),
);
const filesDirectory = resolve(argument('--files-dir') || resolve(dirname(sourcePath), 'files'));
const receiptPath = resolve(
  argument('--receipt') ||
    resolve(
      dirname(sourcePath),
      args.includes('--apply') ? 'convex-migration-receipt.json' : 'convex-migration-plan.json',
    ),
);
const inventoryPath = resolve(dirname(sourcePath), 'convex-pending-files.json');
const apply = args.includes('--apply');
const deferFiles = args.includes('--defer-files');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
let stage = 'source-validation';

async function privateJson(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await chmod(path, 0o600);
}

// Run the authenticated, installed official CLI. Piped output is JSON; neither
// arguments, stderr nor error objects are printed because a failed batch can
// contain private calendar data. There is no shell interpolation.
async function call(name, payload) {
  const output = await new Promise((resolveOutput, reject) => {
    const child = spawn(
      'pnpm',
      [
        'exec',
        'convex',
        'run',
        name,
        JSON.stringify(payload),
        '--deployment',
        targetDeployment,
        '--typecheck',
        'disable',
        '--codegen',
        'disable',
      ],
      {
        cwd: workspace,
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const chunks = [];
    let length = 0;
    child.stdout.on('data', (chunk) => {
      length += chunk.length;
      if (length > 1_000_000) {
        child.kill();
        reject(Error('Resposta da migração excede o limite.'));
      } else chunks.push(chunk);
    });
    child.stderr.resume();
    child.on('error', () =>
      reject(Error('Não foi possível executar a CLI autenticada do Convex.')),
    );
    child.on('close', (code) =>
      code === 0
        ? resolveOutput(Buffer.concat(chunks).toString('utf8'))
        : reject(
            Error(
              'A etapa do Convex foi interrompida. Confira o estado pelo identificador do snapshot.',
            ),
          ),
    );
  });
  try {
    return JSON.parse(output.trim());
  } catch {
    throw Error('Resposta inesperada da CLI do Convex.');
  }
}

try {
  const raw = await readFile(sourcePath);
  const source = JSON.parse(raw);
  const digest = sha256(raw);
  const plan = planSourceMigration(source, { deferFiles });
  const available = [];
  let missing = 0;
  if (!deferFiles) {
    for (const file of plan.files) {
      const path = resolve(filesDirectory, file.path);
      if (!path.startsWith(filesDirectory + sep)) throw Error('Caminho de arquivo inválido.');
      let bytes;
      try {
        bytes = await readFile(path);
      } catch (error) {
        if (error.code === 'ENOENT') {
          missing++;
          continue;
        }
        throw error;
      }
      if (bytes.length !== file.size || bytes.subarray(0, 5).toString() !== '%PDF-')
        throw Error('Arquivo local diverge do inventário original.');
      if (
        file.etag &&
        /^[a-f0-9]{32}$/i.test(file.etag) &&
        createHash('md5').update(bytes).digest('hex').toLowerCase() !== file.etag.toLowerCase()
      )
        throw Error('Hash do arquivo local diverge da origem.');
      available.push({ ...file, sha256: sha256(bytes) });
    }
    plan.manifest.fileManifest = available;
  }
  const report = {
    sourceProject,
    target: targetUrl,
    sourceDigest: digest,
    counts: plan.manifest.counts,
    calendarVersions: plan.manifest.calendarVersions,
    reviewVersions: plan.manifest.reviewVersions,
    expectedAccounts: plan.manifest.expectedAccounts,
    sourceFiles: plan.files.length,
    filesAvailable: available.length,
    filesPending: deferFiles ? plan.files.length : missing,
    deferredFiles: deferFiles,
    baseBatches: plan.baseBatches.length,
    archiveBatches: plan.archiveBatches.length,
    contentRecords: plan.manifest.contentRecords,
    contentBatches: plan.contentBatches.length,
    applied: false,
  };
  await privateJson(inventoryPath, {
    sourceProject,
    sourceDigest: digest,
    deferred: deferFiles,
    files: deferFiles
      ? plan.files
      : plan.files.filter((file) => !available.some((item) => item.path === file.path)),
  });
  if (!apply) {
    await privateJson(receiptPath, report);
    console.log(JSON.stringify(report, null, 2));
  } else {
    stage = 'target-and-backup-guard';
    const env = parseEnv(await readFile(resolve(workspace, '.env.convex.local'), 'utf8'));
    if (
      env.DENTEC_BACKEND !== 'convex' ||
      env.CONVEX_URL !== targetUrl ||
      Number(env.PORT) !== 4183
    )
      throw Error('O destino deve ser exclusivamente o laboratório Convex isolado.');
    if (!deferFiles && missing)
      throw Error(
        'Existem arquivos pendentes. Use --defer-files para adiar explicitamente os PDFs.',
      );
    const backupPath = argument('--lab-backup');
    if (!backupPath)
      throw Error('Informe --lab-backup com o backup integral anterior do laboratório.');
    const backup = await readFile(resolve(backupPath));
    if (backup.length < 22 || backup.subarray(0, 2).toString() !== 'PK')
      throw Error('Backup anterior ausente ou inválido.');
    const backupDigest = sha256(backup);
    report.backupDigest = backupDigest;
    let progress = await call('migration:begin', { digest, backupDigest, manifest: plan.manifest });
    const save = async () => {
      report.progress = progress;
      await privateJson(receiptPath, report);
    };
    await save();
    stage = 'clear-target';
    while (progress.phase === 'clearing') progress = await call('migration:clearBatch', { digest });
    console.log(JSON.stringify({ stage, phase: progress.phase }));
    await save();
    stage = 'base-data';
    for (let index = progress.baseNext; index < plan.baseBatches.length; index++) {
      progress = await call('migration:appendBase', {
        digest,
        index,
        changes: plan.baseBatches[index],
      });
      if (index % 10 === 0)
        console.log(JSON.stringify({ stage, done: index + 1, total: plan.baseBatches.length }));
      await save();
    }
    stage = 'calendar-archives';
    for (let index = progress.archivesNext; index < plan.archiveBatches.length; index++) {
      progress = await call('migration:appendArchives', {
        digest,
        index,
        versions: plan.archiveBatches[index],
      });
      if (index % 10 === 0)
        console.log(JSON.stringify({ stage, done: index + 1, total: plan.archiveBatches.length }));
      await save();
    }
    progress = await call('migration:prepareFiles', { digest });
    stage = 'native-storage';
    if (!deferFiles && progress.phase === 'files') {
      for (const file of available) {
        if (await call('migration:fileStatus', { digest, path: file.path, sha256: file.sha256 }))
          continue;
        const uploadUrl = await call('migration:uploadUrl', { digest });
        const bytes = await readFile(resolve(filesDirectory, file.path));
        const response = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/pdf' },
          body: bytes,
          signal: AbortSignal.timeout(120_000),
          redirect: 'error',
        });
        if (!response.ok) throw Error('O envio do arquivo ao Convex foi interrompido.');
        const { storageId } = await response.json();
        progress = await call('migration:registerFile', {
          digest,
          path: file.path,
          sha256: file.sha256,
          size: file.size,
          storageId,
        });
        await save();
      }
    }
    stage = 'verify-counts';
    do {
      progress = await call('migration:verify', { digest });
      await save();
    } while (progress.phase === 'verifying');
    stage = 'verify-content';
    for (let index = progress.contentNext; index < plan.contentBatches.length; index++) {
      progress = await call('migration:verifyContent', {
        digest,
        index,
        checks: plan.contentBatches[index],
      });
      if (index % 10 === 0)
        console.log(JSON.stringify({ stage, done: index + 1, total: plan.contentBatches.length }));
      await save();
    }
    stage = 'native-auth';
    if (progress.phase !== 'complete') {
      let cursor = null,
        done = false,
        imported = 0,
        skipped = 0;
      while (!done) {
        const result = await call('nativeAuth:initializeImportedAccounts', {
          paginationOpts: { cursor, numItems: 100 },
        });
        imported += result.imported;
        skipped += result.skipped;
        cursor = result.continueCursor;
        done = result.isDone;
      }
      report.auth = { imported, skipped };
    }
    stage = 'verify-auth';
    for (let index = progress.authNext; index < plan.authBatches.length; index++) {
      progress = await call('migration:verifyAuth', {
        digest,
        index,
        checks: plan.authBatches[index],
      });
      await save();
    }
    stage = 'complete';
    progress = await call('migration:finish', { digest });
    report.applied = true;
    report.completedAt = new Date().toISOString();
    await save();
    console.log(JSON.stringify(report, null, 2));
  }
} catch {
  // Never include raw driver errors, subprocess arguments, source rows, paths,
  // tokens or credentials in console output.
  console.error(
    JSON.stringify({
      migration: 'interrupted',
      stage,
      sourceProject,
      target: targetUrl,
      resumable: true,
    }),
  );
  process.exitCode = 1;
}
