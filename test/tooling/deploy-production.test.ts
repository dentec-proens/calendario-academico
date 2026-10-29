import { test, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { changesBackend } from '../../scripts/release-backup.ts';

const execute = promisify(execFile);
const commit = 'a'.repeat(40);
const lockRelease = 'origin :refs/heads/codex/production-release-lock';
const promote = 'POST /v10/projects/prj_AlAdqLCrChRgLBS1wRnjif72pF01/promote/dpl_new';
// Every subprocess and HTTP request is intercepted. Unknown calls fail closed;
// these tests never invoke Git, publish Convex or access any remote deployment.
const preloadSource = String.raw`
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import fs, { writeFileSync } from 'node:fs';
import path from 'node:path';
const scenario = process.env.SCENARIO;
const backend = scenario.startsWith('backend-');
const calls = [];
const commit = 'a'.repeat(40), previous = 'b'.repeat(40);
const packageContent = fs.readFileSync(path.join(process.cwd(),'package.json'),'utf8');
let snapshotDirectory;
let staged = false, manual = false, promoted = false, deployed = false, reads = 0, statusReads = 0;
function record(name) { calls.push(name); writeFileSync(process.env.LOG, JSON.stringify(calls)); }
writeFileSync(process.env.LOG, '[]');
childProcess.execFileSync = (command, args, options) => {
  if (command === process.execPath && args[1] === 'function-spec') {
    record('function-spec');
    return JSON.stringify({url:scenario==='wrong-convex'?'https://other-deployment.convex.cloud':'https://exuberant-cheetah-138.convex.cloud',functions:deployed?[{identifier:'migrations.js:start'},{identifier:'migrations.js:status'}]:[]});
  }
  if (command === process.execPath && args[1] === 'run') {
    const name = args[2]; record(name);
    if (name === 'operations:status') return JSON.stringify({emergency:scenario==='emergency',paused:scenario==='paused',commit:null,active:[]});
    if (name === 'migrations:start') return 'null';
    if (name === 'migrations:status') {
      statusReads++;
      if (!backend) return '[]';
      const failed = scenario === 'backend-migration-failed';
      return JSON.stringify([{name:'migrations:fillLabel',state:failed?'failed':statusReads>1?'success':'inProgress',processed:2,error:failed?'Invalid document':null}]);
    }
    throw Error('Unexpected operational call ' + name);
  }
  if (command !== 'git') throw Error('Unexpected executable');
  const op = args.join(' ');
  record('git '+op);
  const isolated = options?.cwd === snapshotDirectory;
  if(args[0] === 'worktree' && args[1] === 'add') {
    snapshotDirectory=args[3];
    fs.mkdirSync(snapshotDirectory,{recursive:true});
    for(const name of ['scripts','config','convex']) fs.cpSync(path.join(process.cwd(),name),path.join(snapshotDirectory,name),{recursive:true});
    fs.writeFileSync(path.join(snapshotDirectory,'package.json'),packageContent);
    fs.symlinkSync(path.join(process.cwd(),'node_modules'),path.join(snapshotDirectory,'node_modules'),'dir');
    return '';
  }
  if(args[0] === 'worktree' && args[1] === 'remove') {
    fs.rmSync(args[3],{recursive:true,force:true});
    return '';
  }
  if (op === 'branch --show-current') return 'main';
  if (op === 'rev-parse refs/heads/main') return commit;
  if (op === 'remote get-url --push --all origin') return 'https://github.com/dentec-proens/calendario-academico.git';
  if (op === 'status --porcelain') return scenario==='dirty'&&!isolated || scenario==='snapshot-dirty'&&isolated?' M web/app.ts':'';
  if (args[0] === 'ls-files') return '';
  if (op === 'rev-parse HEAD') return staged && (scenario==='head-changed'&&!isolated || scenario==='snapshot-head-changed'&&isolated)?'c'.repeat(40):commit;
  if (args[0] === 'diff') return backend?'convex/calendars.ts\nweb/app.ts':'web/app.ts';
  if (args[0] === 'commit-tree') return 'd'.repeat(40);
  throw Error('Unexpected Git read '+op);
};
childProcess.spawnSync = (command, args) => {
  if(command==='pnpm' && args[0]==='install') {record('snapshot-install');return {status:scenario==='snapshot-install-failed'?1:0};}
  if (command === 'git' && ['fetch','merge-base','push'].includes(args[0])) {
    record('git '+args.join(' '));
    return {status: scenario==='locked' && args.some(a=>a.includes(':refs/heads/codex/production-release-lock')) ? 1:0};
  }
  if (command === process.execPath && args[1] === 'deploy') {
    record('backend-deploy');
    if(args.includes('--typecheck'))throw Error('Unexpected typecheck override');
    deployed=true;
    return {status:scenario==='deploy-failed'?1:0};
  }
  if (command === process.execPath && args[1] === 'export') {
    record('backup');
    fs.writeFileSync(args[args.indexOf('--path')+1],Buffer.concat([Buffer.from([80,75,3,4]),Buffer.alloc(100)]));
    return {status:scenario==='backend-backup-failed'?1:0};
  }
  throw Error('Unexpected subprocess '+command+' '+args.join(' '));
};
const projectId='prj_AlAdqLCrChRgLBS1wRnjif72pF01';
function deployment(id,sha) { return {id,url:id==='dpl_old'?'old.vercel.app':'candidate.vercel.app',projectId:scenario==='wrong-project'?'prj_other':projectId,target:'production',readyState:scenario==='build-failed'&&id==='dpl_new'?'ERROR':'READY',meta:{githubCommitSha:sha}}; }
globalThis.fetch = async (url, options={}) => {
  const u = new URL(url); if(u.hostname!=='api.vercel.com') throw Error('Unexpected host');
  const method=options.method||'GET'; record(method+' '+u.pathname);
  if(u.pathname==='/v9/projects/'+projectId) {
    if(method==='PATCH') manual=true;
    return Response.json({id:projectId,accountId:'team_IEsOK7eMdDWvSxzHFg3re3ZT',name:'calendario-academico',autoAssignCustomDomains:scenario==='auto-alias'?true:!manual,link:{type:'github',org:'dentec-proens',repo:'calendario-academico',productionBranch:'main'}});
  }
  if(u.pathname==='/v13/deployments/calendario-academico-phi.vercel.app') { reads++; return Response.json(deployment(promoted || (scenario==='concurrent' && reads>1)?'dpl_new':'dpl_old',promoted?commit:previous)); }
  if(u.pathname==='/v13/deployments'&&method==='POST') { if(!manual) throw Error('Unsafe creation'); staged=true; return Response.json({id:'dpl_new'}); }
  if(u.pathname==='/v13/deployments/dpl_old')return Response.json(deployment('dpl_old',previous));
  if(u.pathname==='/v13/deployments/dpl_new') return Response.json(deployment('dpl_new',scenario==='wrong-sha'?'c'.repeat(40):commit));
  if(u.pathname==='/v10/projects/'+projectId+'/promote/dpl_new'&&method==='POST') {promoted=true;manual=false;if(scenario==='promotion-unknown') throw Error('Lost response');return Response.json({});}
  throw Error('Unexpected Vercel call '+method+' '+u.pathname);
};
syncBuiltinESMExports();
`;
async function release(scenario: string, args: string[] = []) {
  const dir = await mkdtemp(join(tmpdir(), 'release-test-'));
  try {
    const preload = join(dir, 'preload.mjs'),
      log = join(dir, 'calls.json');
    await writeFile(preload, preloadSource);
    if (scenario !== 'no-release-env')
      await writeFile(
        join(dir, 'release.env'),
        `VERCEL_TOKEN=synthetic-token\n${scenario === 'backend-no-backup-dir' ? '' : `DENTEC_RELEASE_BACKUP_DIR=${dir}\n`}`,
        { mode: 0o600 },
      );
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      SCENARIO: scenario,
      LOG: log,
      DENTEC_RELEASE_ENV_FILE: join(dir, 'release.env'),
    };
    for (const key of [
      'VERCEL_TOKEN',
      'DENTEC_RELEASE_BACKUP_DIR',
      'CONVEX_DEPLOY_KEY',
      'CONVEX_DEPLOYMENT_TOKEN',
      'CONVEX_SELF_HOSTED_URL',
      'CONVEX_SELF_HOSTED_ADMIN_KEY',
    ])
      delete env[key];
    const result = await execute(
      process.execPath,
      [
        '--import',
        'tsx',
        '--import',
        pathToFileURL(preload).href,
        fileURLToPath(new URL('../../scripts/deploy-production.ts', import.meta.url)),
        ...args,
      ],
      { env, timeout: 15_000 },
    ).then(
      ({ stdout, stderr }) => ({ code: 0, stdout, stderr }),
      (error: unknown) => {
        const e = error as { code: number; stdout: string; stderr: string };
        return { code: e.code, stdout: e.stdout, stderr: e.stderr };
      },
    );
    return { ...result, calls: JSON.parse(await readFile(log, 'utf8')) as string[] };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
function expectOrder(calls: string[], pairs: Array<[string, string]>) {
  for (const [first, second] of pairs) {
    expect(calls, `${first} → ${second}`).toContain(first);
    expect(calls.indexOf(first)).toBeLessThan(calls.indexOf(second));
  }
}

test('frontend release builds Production, deploys Convex with default typecheck and promotes without backup', async () => {
  const result = await release('success');
  expect(result.code, result.stderr).toBe(0);
  const calls = result.calls;
  expectOrder(calls, [
    [
      'PATCH /v9/projects/prj_AlAdqLCrChRgLBS1wRnjif72pF01',
      `git push origin ${commit}:refs/heads/main`,
    ],
    ['POST /v13/deployments', 'backend-deploy'],
    ['backend-deploy', 'migrations:start'],
    ['migrations:status', promote],
  ]);
  expect(calls).not.toContain('backup');
  expect(calls.some((call) => /^(quality|smoke|releases:)/.test(call))).toBe(false);
  expect(calls.findIndex((call) => call.endsWith(lockRelease))).toBeGreaterThan(
    calls.indexOf(promote),
  );
  expect(calls.at(-1)).toContain('git worktree remove --force');
});

test('backend release exports first, deploys, waits for migrations and only then promotes', async () => {
  const result = await release('backend-success');
  expect(result.code, result.stderr).toBe(0);
  expectOrder(result.calls, [
    ['POST /v13/deployments', 'backup'],
    ['backup', 'backend-deploy'],
    ['backend-deploy', 'migrations:start'],
    ['migrations:start', 'migrations:status'],
    ['migrations:status', promote],
  ]);
  expect(result.calls.filter((call) => call === 'migrations:status')).toHaveLength(2);
  expect(result.stdout).toContain('Migração migrations:fillLabel concluída');
});

test.each([
  'snapshot-dirty',
  'snapshot-head-changed',
  'snapshot-install-failed',
  'wrong-convex',
  'paused',
  'emergency',
  'locked',
  'auto-alias',
  'build-failed',
  'wrong-sha',
  'wrong-project',
  'concurrent',
  'backend-no-backup-dir',
  'backend-backup-failed',
])('failure %s prevents backend deployment and promotion', async (scenario) => {
  const result = await release(scenario);
  expect(result.code, result.stderr).not.toBe(0);
  expect(result.calls).not.toContain('backend-deploy');
  expect(result.calls.some((call) => call.startsWith('POST /v10/'))).toBe(false);
});

test('a missing release.env explains the setup without running operations', async () => {
  const result = await release('no-release-env', ['--dry-run']);
  expect(result.code).toBe(1);
  expect(result.stderr).toContain('https://vercel.com/account/tokens');
  expect(result.stderr).toContain('DENTEC_RELEASE_BACKUP_DIR=');
  expect(result.calls).toEqual([]);
});

test('a missing backup directory is refused before reserving or building', async () => {
  const result = await release('backend-no-backup-dir');
  expect(result.stderr).toContain('DENTEC_RELEASE_BACKUP_DIR');
  expect(result.calls.some((call) => call.startsWith('git push'))).toBe(false);
  expect(result.calls.some((call) => call.startsWith('POST /v13/'))).toBe(false);
});

test.each(['deploy-failed', 'backend-migration-failed', 'promotion-unknown'])(
  'failure %s preserves the reservation and reports partial publication',
  async (scenario) => {
    const result = await release(scenario);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('Reserva preservada');
    expect(result.calls.some((call) => call.endsWith(lockRelease))).toBe(false);
    if (scenario === 'promotion-unknown')
      expect(result.stderr).toContain('A promoção pode ter ocorrido');
    else {
      expect(result.stderr).toContain('O backend pode ter sido publicado');
      expect(result.calls.some((call) => call.startsWith('POST /v10/'))).toBe(false);
    }
    if (scenario === 'backend-migration-failed')
      expect(result.stderr).toContain('migrations:fillLabel terminou como failed');
  },
);

test.each([{ args: ['--dry-run'] }, { args: ['--resume'] }, { args: ['--skip-checks'] }])(
  'invocation %j does not execute operations',
  async ({ args }) => {
    const result = await release('success', args);
    expect(result.code).toBe(args[0] === '--dry-run' ? 0 : 1);
    expect(result.calls).toEqual([]);
  },
);

test.each(['dirty', 'head-changed'])(
  'release %s publishes the captured commit from an isolated checkout',
  async (scenario) => {
    const result = await release(scenario);
    expect(result.code, result.stderr).toBe(0);
    expect(result.calls).toContain('snapshot-install');
    expect(result.calls).toContain(`git push origin ${commit}:refs/heads/main`);
    expect(result.calls).toContain('backend-deploy');
    expect(result.calls.some((call) => call.startsWith('git worktree add --detach'))).toBe(true);
    expect(result.calls.at(-1)).toContain('git worktree remove --force');
    expect(result.calls.some((call) => /git (stash|reset|clean|checkout)/.test(call))).toBe(false);
  },
);

test('backend detection includes shared code, schema, runtime and dependencies', () => {
  expect(changesBackend(['web/editor.tsx', 'docs/uso.md'])).toBe(false);
  for (const path of [
    'convex/schema.ts',
    'src/domain/calendar/base.ts',
    'config/environments.ts',
    'migration/import.ts',
    'pnpm-lock.yaml',
    'package.json',
    'convex.json',
    '.npmrc',
  ]) {
    expect(changesBackend([path])).toBe(true);
  }
});
