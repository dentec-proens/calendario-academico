import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { unzipSync, strFromU8 } from 'fflate';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { environments } from '../config/environments.ts';
import schema from '../convex/schema.ts';
import { assertNoTargetOverrides, convexCli, root } from './environment.ts';
import {
  assertPlan,
  assertSourceSnapshot,
  createPlan,
  fingerprint,
  verifyPlanSnapshot,
} from '../migration/plan.ts';
import { createCanonicalPlan } from '../migration/canonical.ts';
import type { Document, MigrationPlan, Snapshot } from '../migration/types.ts';

export function readSnapshot(path: string): Snapshot {
  const archive = unzipSync(readFileSync(path), {
    filter: ({ name }) =>
      /^([A-Za-z_][A-Za-z0-9_]*)\/documents\.jsonl$/.test(name) || name.startsWith('_storage/'),
  });
  const files = Object.keys(archive);
  const snapshot: Snapshot = {};
  for (const name of files) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\/documents\.jsonl$/.exec(name);
    if (!match) continue;
    const text = strFromU8(archive[name]!);
    snapshot[match[1]] = text
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
  if (!snapshot._tables || !snapshot._storage)
    throw Error('Use um backup completo com --include-file-storage.');
  const stored = files.filter(
    (name) =>
      name.startsWith('_storage/') &&
      !name.endsWith('documents.jsonl') &&
      !name.endsWith('generated_schema.jsonl'),
  );
  for (const row of snapshot._storage) {
    const filename = stored.find((name) => name.split('/').at(-1)?.split('.')[0] === row._id);
    if (!filename) throw Error('O backup não contém todos os bytes do Storage.');
    const bytes = archive[filename]!;
    const digest = createHash('sha256').update(bytes).digest();
    if (
      bytes.length !== row.size ||
      ![digest.toString('base64'), digest.toString('hex')].includes(String(row.sha256))
    )
      throw Error('O tamanho ou SHA-256 de um arquivo diverge dos metadados do Storage.');
  }
  return snapshot;
}

export function fileDigest(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
type ExportedTable = { tableName: string; documentType: any; indexes: unknown };
function schemaTables(): ExportedTable[] {
  return (
    JSON.parse((schema as unknown as { export(): string }).export()) as { tables: ExportedTable[] }
  ).tables;
}
export function schemaDigest(): string {
  return fingerprint(schemaTables());
}
export function validateSchema(snapshot: Snapshot): void {
  for (const definition of schemaTables())
    for (const row of snapshot[definition.tableName] ?? []) {
      const { _id, _creationTime, ...value } = row;
      validateValue(definition.documentType, value, definition.tableName);
    }
}
function validateValue(validator: any, value: unknown, path: string): void {
  const fail = () => {
    throw Error(`Documento incompatível com o schema final: ${path} (${validator.type}).`);
  };
  if (validator.type === 'any') return;
  if (validator.type === 'union') {
    for (const option of validator.value) {
      try {
        validateValue(option, value, path);
        return;
      } catch {
        /* Try the next declared variant. */
      }
    }
    fail();
  } else if (validator.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
    const object = value as Document;
    for (const [key, field] of Object.entries(validator.value) as [string, any][]) {
      if (!(key in object)) {
        if (!field.optional) throw Error(`Campo obrigatório ausente: ${path}.${key}.`);
      } else validateValue(field.fieldType, object[key], `${path}.${key}`);
    }
    for (const key of Object.keys(object))
      if (!(key in validator.value)) throw Error(`Campo legado inesperado: ${path}.${key}.`);
  } else if (validator.type === 'array') {
    if (!Array.isArray(value)) return fail();
    value.forEach((item, index) => validateValue(validator.value, item, `${path}[${index}]`));
  } else if (validator.type === 'record') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
    for (const [key, item] of Object.entries(value)) {
      validateValue(validator.keys, key, `${path}.key`);
      validateValue(validator.values.fieldType ?? validator.values, item, `${path}.${key}`);
    }
  } else if (validator.type === 'id') {
    if (typeof value !== 'string' || !value) fail();
  } else if (validator.type === 'literal') {
    if (value !== validator.value) fail();
  } else if (validator.type === 'null') {
    if (value !== null) fail();
  } else if (validator.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) fail();
  } else if (typeof value !== validator.type) fail();
}

function privatePath(path: string): string {
  const absolute = resolve(path),
    relative = absolute.startsWith(root) ? absolute.slice(root.length) : '';
  if (!relative || !relative.split(/[\\/]/).some((part) => part.startsWith('backup-')))
    throw Error('Dados privados devem ficar em backup-*/ dentro do projeto, ignorado pelo Git.');
  return absolute;
}
export function save(path: string, value: unknown): void {
  const target = privatePath(path);
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  writeFileSync(target, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  chmodSync(target, 0o600);
}
export function cli(args: string[], project = root, inherit = false): string {
  assertNoTargetOverrides(process.env);
  const target = args.indexOf('--deployment');
  if (target >= 0 && args[target + 1] === 'local') {
    const config = JSON.parse(
      readFileSync(join(project, '.convex', 'local', 'default', 'config.json'), 'utf8'),
    ) as { ports: { cloud: number }; adminKey: string; deploymentName: string };
    if (!config.deploymentName.startsWith('anonymous-') || !Number.isInteger(config.ports.cloud))
      throw Error('Destino local anônimo não confirmado.');
    args = [
      ...args.slice(0, target),
      ...args.slice(target + 2),
      '--url',
      `http://127.0.0.1:${config.ports.cloud}`,
      '--admin-key',
      config.adminKey,
    ];
  }
  try {
    return (
      execFileSync(process.execPath, [convexCli, ...args], {
        cwd: project,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        stdio: inherit ? ['ignore', 'inherit', 'inherit'] : ['ignore', 'pipe', 'inherit'],
      }) ?? ''
    );
  } catch {
    // Node's child-process error includes the full command line. It may contain
    // a local admin key or private migration payload, so never print it.
    throw Error(
      `A CLI Convex falhou em ${args[0]}. Confira o estado antes de retomar o mesmo plano.`,
    );
  }
}
function option(args: string[], name: string, required = true): string | undefined {
  const index = args.indexOf(`--${name}`);
  const result = index < 0 ? undefined : args[index + 1];
  if ((!result || result.startsWith('--')) && required) throw Error(`Falta --${name}.`);
  return result;
}
function loadPlan(path: string): MigrationPlan {
  const plan = JSON.parse(readFileSync(path, 'utf8')) as MigrationPlan;
  assertPlan(plan);
  return plan;
}
function deploymentName(value: string): string {
  if (value !== 'local' && !/^[a-z]+(?:-[a-z0-9]+)+$/.test(value))
    throw Error('Deployment explícito inválido.');
  return value;
}

export function assertCompleteCheckpoint(plan: MigrationPlan, checkpoint: any): void {
  if (
    !checkpoint ||
    checkpoint.planDigest !== plan.digest ||
    checkpoint.sourceDigest !== plan.sourceDigest ||
    checkpoint.totalBatches !== plan.batches.length ||
    checkpoint.nextBatch !== plan.batches.length
  )
    throw Error('Checkpoint final deste plano ausente ou incompleto no deployment conferido.');
}

export function prepareProject(plan: MigrationPlan, path: string): void {
  const project = privatePath(path);
  if (existsSync(project)) throw Error('O projeto temporário já existe; use outro diretório.');
  mkdirSync(join(project, 'convex', '_generated'), { recursive: true, mode: 0o700 });
  const tables = [
    ...new Set([...plan.tables, ...Object.keys(schema.tables), 'migrationState']),
  ].sort();
  const componentConfig = join(root, 'convex', 'convex.config.ts');
  if (existsSync(componentConfig))
    copyFileSync(componentConfig, join(project, 'convex', 'convex.config.ts'));
  const text = `import { defineSchema, defineTable } from 'convex/server';\nimport { v } from 'convex/values';\n// Temporary maintenance schema: application functions are absent.\nexport default defineSchema({\n${tables.map((table) => `  ${JSON.stringify(table)}: defineTable(v.any()),`).join('\n')}\n});\n`;
  writeFileSync(join(project, 'convex', 'schema.ts'), text);
  copyFileSync(join(root, 'tsconfig.base.json'), join(project, 'tsconfig.base.json'));
  copyFileSync(join(root, 'convex', 'tsconfig.json'), join(project, 'convex', 'tsconfig.json'));
  copyFileSync(join(root, 'migration', 'engine.ts'), join(project, 'convex', 'migration.ts'));
  copyFileSync(
    join(root, 'migration', '_generated', 'server.ts'),
    join(project, 'convex', '_generated', 'server.ts'),
  );
  writeFileSync(join(project, 'convex.json'), JSON.stringify({ functions: 'convex/' }));
  writeFileSync(
    join(project, 'package.json'),
    JSON.stringify({
      name: 'calendario-schema-migration',
      private: true,
      type: 'module',
      dependencies: {
        convex: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).dependencies.convex,
        '@convex-dev/presence': JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
          .dependencies['@convex-dev/presence'],
      },
    }),
  );
  symlinkSync(join(root, 'node_modules'), join(project, 'node_modules'), 'dir');
  save(join(project, 'plan.json'), plan);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2),
    command = args.shift();
  if (command === 'plan') {
    const snapshot = privatePath(option(args, 'snapshot')!);
    if (
      args.some(
        (arg) => arg.startsWith('--') && !['--canonical', '--snapshot', '--out'].includes(arg),
      )
    )
      throw Error('Opção de planejamento não suportada.');
    const plan = args.includes('--canonical')
      ? createCanonicalPlan(readSnapshot(snapshot), fileDigest(snapshot))
      : createPlan(readSnapshot(snapshot), fileDigest(snapshot));
    save(option(args, 'out')!, plan);
    console.log(
      `Plano ${plan.digest}: ${plan.batches.length} lotes; ${plan.missingFiles.length} arquivos indisponíveis preservados por referência.`,
    );
  } else if (command === 'prepare') {
    const plan = loadPlan(option(args, 'plan')!);
    prepareProject(plan, option(args, 'out')!);
    console.log(
      'Projeto temporário criado. Publique-o somente no deployment explicitamente conferido, antes de executar apply.',
    );
  } else if (command === 'apply') {
    const plan = loadPlan(option(args, 'plan')!),
      deployment = deploymentName(option(args, 'deployment')!),
      project = realpathSync(option(args, 'project')!);
    if (!plan.batches.length)
      throw Error('Plano sem alterações: valide o snapshot sem iniciar manutenção.');
    if (option(args, 'confirm') !== plan.digest)
      throw Error('Confirme o digest exato do plano com --confirm.');
    if (deployment === environments.production.deployment) {
      const receipt = JSON.parse(readFileSync(option(args, 'rehearsal')!, 'utf8'));
      if (
        receipt.planDigest !== plan.digest ||
        receipt.sourceDigest !== plan.sourceDigest ||
        receipt.schemaDigest !== schemaDigest() ||
        receipt.deployment === deployment ||
        receipt.verificationMode !== 'live_export' ||
        receipt.result !== 'verified'
      )
        throw Error(
          'Produção exige ensaio verificado deste plano e deste schema em outro deployment.',
        );
    }
    if (!existsSync(join(project, 'convex', 'migration.ts')))
      throw Error('Use o projeto temporário preparado, com aplicação em manutenção.');
    const status = JSON.parse(
      cli(['run', 'migration:status', '{}', '--deployment', deployment], project).trim() || 'null',
    );
    let next = Number(status?.nextBatch ?? 0);
    if (status && (status.planDigest !== plan.digest || status.sourceDigest !== plan.sourceDigest))
      throw Error('Checkpoint de outro plano.');
    if (!status) {
      const before = join(
        dirname(resolve(option(args, 'plan')!)),
        `backup-before-${deployment}-${Date.now()}.zip`,
      );
      cli(
        ['export', '--deployment', deployment, '--include-file-storage', '--path', before],
        project,
        true,
      );
      chmodSync(before, 0o600);
      const actual = readSnapshot(before);
      assertSourceSnapshot(plan, actual);
    }
    for (; next < plan.batches.length; next++) {
      const batch = plan.batches[next]!;
      const payload = {
        planDigest: plan.digest,
        sourceDigest: plan.sourceDigest,
        batchDigest: batch.digest,
        batch: next,
        totalBatches: plan.batches.length,
        operations: batch.operations,
      };
      const result = JSON.parse(
        cli(
          ['run', 'migration:apply', JSON.stringify(payload), '--deployment', deployment],
          project,
        ),
      );
      if (result.nextBatch !== next + 1) throw Error('Checkpoint não avançou conforme o lote.');
      if ((next + 1) % 20 === 0 || next + 1 === plan.batches.length)
        console.log(`Migração: ${next + 1}/${plan.batches.length} lotes confirmados.`);
    }
    console.log(
      'Lotes concluídos. Exporte o deployment e execute verify antes de publicar o backend final.',
    );
  } else if (command === 'finish') {
    const plan = loadPlan(option(args, 'plan')!);
    const deployment = deploymentName(option(args, 'deployment')!);
    const project = realpathSync(option(args, 'project')!);
    const receipt = JSON.parse(readFileSync(option(args, 'receipt')!, 'utf8'));
    if (
      receipt.result !== 'verified' ||
      receipt.planDigest !== plan.digest ||
      receipt.sourceDigest !== plan.sourceDigest ||
      receipt.schemaDigest !== schemaDigest() ||
      receipt.verificationMode !== 'live_export' ||
      receipt.deployment !== deployment
    )
      throw Error('A limpeza exige o recibo verificado deste plano, schema e deployment.');
    const status = JSON.parse(
      cli(['run', 'migration:status', '{}', '--deployment', deployment], project).trim() || 'null',
    );
    assertCompleteCheckpoint(plan, status);
    if (
      status.verifiedSnapshotDigest !== receipt.snapshotDigest ||
      status.verifiedSchemaDigest !== receipt.schemaDigest
    )
      throw Error('O recibo não corresponde à verificação registrada neste deployment.');
    cli(
      [
        'run',
        'migration:finish',
        JSON.stringify({
          planDigest: plan.digest,
          sourceDigest: plan.sourceDigest,
          snapshotDigest: receipt.snapshotDigest,
          schemaDigest: receipt.schemaDigest,
        }),
        '--deployment',
        deployment,
      ],
      project,
    );
    console.log('Checkpoint temporário removido. Preserve o recibo e publique o backend final.');
  } else if (command === 'verify') {
    const plan = loadPlan(option(args, 'plan')!),
      snapshot = privatePath(option(args, 'snapshot')!),
      deployment = deploymentName(option(args, 'deployment')!),
      project = realpathSync(option(args, 'project')!);
    if (existsSync(snapshot))
      throw Error('A saída do novo backup já existe. Use outro caminho para verify.');
    mkdirSync(dirname(snapshot), { recursive: true, mode: 0o700 });
    cli(
      ['export', '--deployment', deployment, '--include-file-storage', '--path', snapshot],
      project,
      true,
    );
    chmodSync(snapshot, 0o600);
    const actual = readSnapshot(snapshot);
    verifyPlanSnapshot(plan, actual);
    validateSchema(actual);
    const checkpoint = actual.migrationState?.[0];
    assertCompleteCheckpoint(plan, checkpoint);
    const receipt = {
      result: 'verified',
      verificationMode: 'live_export',
      planDigest: plan.digest,
      sourceDigest: plan.sourceDigest,
      snapshotDigest: fileDigest(snapshot),
      schemaDigest: schemaDigest(),
      deployment,
      verifiedAt: new Date().toISOString(),
      counts: plan.expectedCounts,
      missingFiles: plan.missingFiles.length,
    };
    cli(
      [
        'run',
        'migration:recordVerification',
        JSON.stringify({
          planDigest: plan.digest,
          sourceDigest: plan.sourceDigest,
          snapshotDigest: receipt.snapshotDigest,
          schemaDigest: receipt.schemaDigest,
        }),
        '--deployment',
        deployment,
      ],
      project,
    );
    save(option(args, 'out')!, receipt);
    console.log(
      'IDs, conteúdo de todas as tabelas, Auth, Storage, históricos e schema final conferidos.',
    );
  } else if (command === 'validate') {
    const plan = loadPlan(option(args, 'plan')!);
    const actual = readSnapshot(privatePath(option(args, 'snapshot')!));
    verifyPlanSnapshot(plan, actual);
    validateSchema(actual);
    console.log('Snapshot validado offline. Esta conferência não emite recibo para produção.');
  } else
    throw Error(
      'Uso: node --import tsx scripts/migrate-data.ts plan|prepare|apply|verify|finish|validate [opções]. Veja docs/migracao-schema.md.',
    );
}
if (
  process.argv[1] &&
  pathToFileURL(isAbsolute(process.argv[1]) ? process.argv[1] : resolve(process.argv[1])).href ===
    import.meta.url
)
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Migração interrompida.');
    process.exitCode = 1;
  });
