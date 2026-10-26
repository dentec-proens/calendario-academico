type ReleaseCall = {
  kind:
    | 'git-read'
    | 'quality'
    | 'fetch'
    | 'fast-forward'
    | 'push-preflight'
    | 'push'
    | 'convex'
    | 'runtime-prepare'
    | 'maintenance-pause'
    | 'maintenance-status'
    | 'maintenance-resume'
    | 'vercel-status'
    | 'portal-smoke'
    | 'scheduled-inventory'
    | 'operational-smoke'
    | 'browser-preflight'
    | 'maintenance-smokePreflight'
    | 'maintenance-authorizeSmoke'
    | 'maintenance-endSmoke';
  args: string[];
  command?: string;
  targetFile?: string;
  env?: Record<string, string>;
};
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import type { ExecFileException } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const releaseScript = fileURLToPath(new URL('../scripts/deploy-production.ts', import.meta.url));
const commit = 'a'.repeat(40);

// The child runs the real release script, with every subprocess operation it
// uses intercepted before the script imports child_process's named exports.
// Unknown commands fail closed: no Git, pnpm or Convex executable is started.
const preloadSource = String.raw`
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';

const scenario = process.env.DENTEC_TEST_RELEASE_SCENARIO;
const output = process.env.DENTEC_TEST_RELEASE_LOG;
const calls = [];
const originalCommit = 'a'.repeat(40);
let checked = false;
let maintenance = scenario === 'retry-published';
function record(call) {
  calls.push(call);
  writeFileSync(output, JSON.stringify(calls));
}
writeFileSync(output, '[]');

childProcess.execFileSync = (command, args) => {
  if (command !== 'git') throw new Error('Unexpected executable: ' + command);
  record({ kind: 'git-read', args });
  const operation = args.join(' ');
  if (operation === 'branch --show-current') return 'main\n';
  if (operation === 'remote get-url --push --all origin')
    return 'https://github.com/dentec-proens/calendario-academico.git\n';
  if (operation === 'status --porcelain')
    return scenario === 'untracked' ? '?? src/uncommitted.ts\n' : '';
  if (operation === 'ls-files --others --ignored --exclude-standard -- convex')
    return scenario === 'ignored' ? 'convex/backup-local/task.ts\n' : '';
  if (operation === 'rev-parse HEAD')
    return (scenario === 'head-changed' && checked ? 'b'.repeat(40) : originalCommit) + '\n';
  if (operation === 'rev-parse origin/main') return (scenario === 'already-published' || scenario === 'retry-published' ? originalCommit : 'b'.repeat(40)) + '\n';
  throw new Error('Unexpected Git read: ' + operation);
};

childProcess.spawnSync = (command, args, options) => {
  let kind;
  let status = 0;
  if (args.includes('check') || args.includes('pnpm check')) {
    kind = 'quality';
    checked = true;
    if (scenario === 'quality-failed') status = 1;
  } else if (command === process.execPath && args.includes('scripts/prepare-pdf-runtime.ts')) {
    kind = 'runtime-prepare';
    if (scenario === 'runtime-failed') status = 1;
  } else if (command === process.execPath && args.includes('scripts/release-smoke.ts')) {
    kind = args.includes('--check-browser') ? 'browser-preflight' : 'operational-smoke';
    if ((['smoke-failed','smoke-and-cleanup-failed'].includes(scenario) && kind === 'operational-smoke') || (scenario === 'browser-missing' && kind === 'browser-preflight')) status = 1;
  } else if (command === 'git') {
    if (args[0] === 'fetch') kind = 'fetch';
    else if (args[0] === 'merge-base') kind = 'fast-forward';
    else if (args[0] === 'push') kind = args.includes('--dry-run') ? 'push-preflight' : 'push';
    else throw new Error('Unexpected Git write: ' + args.join(' '));
  } else if (command === process.execPath && args[1] === 'run' && /convex[\\/]bin[\\/]main\.js$/.test(args[0])) {
    const name = args[2].split(':')[1];
    kind = name === 'scheduledPage' ? 'scheduled-inventory' : 'maintenance-' + name;
    record({kind, command, args});
    if (scenario === 'control-unavailable') return {status:1, stdout:'', stderr:'missing control'};
    if (name === 'smokePreflight' && scenario === 'invalid-smoke-identity') return {status:1, stdout:'', stderr:'invalid smoke identity'};
    if (name === 'scheduledPage') return {status:0, stdout:JSON.stringify({page:scenario === 'unknown-scheduled' ? [{name:'removed:handler',state:{kind:'pending'}}] : [],isDone:true,continueCursor:''}), stderr:''};
    if (name === 'pause') maintenance = true;
    if (name === 'pause' && scenario === 'pause-unknown') return {status:1,stdout:'',stderr:'connection lost after pause'};
    if (name === 'authorizeSmoke' && scenario === 'smoke-authorization-unknown') return {status:1,stdout:'',stderr:'connection lost after authorization'};
    if (name === 'endSmoke' && ['smoke-cleanup-failed','smoke-and-cleanup-failed'].includes(scenario)) return {status:1,stdout:'',stderr:'cleanup failed'};
    if (name === 'resume') maintenance = false;
    const status = {emergency:scenario === 'emergency',paused: scenario === 'control-lost' ? false : maintenance, commit: originalCommit, active:[]};
    return {status:0, stdout:JSON.stringify(name === 'status' ? status : null), stderr:''};
  } else if (command === process.execPath && args[1] === 'deploy' && /convex[\\/]bin[\\/]main\.js$/.test(args[0])) {
    kind = 'convex';
    const index = args.indexOf('--env-file');
    if (index < 0) throw new Error('Release must provide an explicit target file.');
    if (scenario === 'schema-failed') status = 1;
    record({
      kind, command, args,
      targetFile: readFileSync(args[index + 1], 'utf8'),
      env: {
        CONVEX_DEPLOYMENT: options.env.CONVEX_DEPLOYMENT,
        VITE_CONVEX_URL: options.env.VITE_CONVEX_URL,
        VITE_CONVEX_SITE_URL: options.env.VITE_CONVEX_SITE_URL,
      },
    });
    return { status, signal: null };
  } else {
    throw new Error('Unexpected subprocess: ' + command + ' ' + args.join(' '));
  }
  record({ kind, command, args });
  return { status, signal: null };
};
globalThis.fetch = async (url) => {
  if (String(url).startsWith('https://api.vercel.com/')) {
    record({kind:'vercel-status',args:[String(url)]});
    const deployment = {uid:'deployment-ready', id:'deployment-ready', state: scenario === 'vercel-failed' ? 'ERROR' : 'READY', readyState: scenario === 'vercel-failed' ? 'ERROR' : 'READY',meta:{githubCommitSha:originalCommit}};
    return new Response(JSON.stringify(String(url).includes('/v7/deployments?') ? {deployments:[deployment]} : deployment),{headers:{'Content-Type':'application/json'}});
  }
  if (String(url) === 'https://calendario-academico-phi.vercel.app') {
    record({kind:'portal-smoke',args:[String(url)]});
    return new Response('<html><script src="/assets/app.js"></script></html>',{status:scenario === 'html-smoke-failed' ? 503 : 200,headers:{'Content-Type':'text/html'}});
  }
  throw new Error('Unexpected fetch: '+url);
};
syncBuiltinESMExports();
`;

async function runRelease(scenario: string, args: string[] = []) {
  const directory = await mkdtemp(join(tmpdir(), 'dentec-release-test-'));
  try {
    const preload = join(directory, 'preload.mjs');
    const log = join(directory, 'calls.json');
    await writeFile(preload, preloadSource);
    const env = { ...process.env };
    for (const key of [
      'CONVEX_DEPLOY_KEY',
      'CONVEX_DEPLOYMENT_TOKEN',
      'CONVEX_SELF_HOSTED_URL',
      'CONVEX_SELF_HOSTED_ADMIN_KEY',
    ])
      delete env[key];
    Object.assign(env, {
      npm_execpath: 'pnpm',
      VERCEL_TOKEN: scenario === 'missing-vercel-token' ? '' : 'synthetic-ci-token',
      DENTEC_TEST_RELEASE_SCENARIO: scenario,
      DENTEC_TEST_RELEASE_LOG: log,
      DENTEC_RELEASE_SMOKE_USER_ID: 'smoke-admin',
      DENTEC_RELEASE_SMOKE_CALENDAR_ID: 'smoke-calendar',
      DENTEC_RELEASE_SMOKE_EMAIL: 'smoke@ifpr.edu.br',
      DENTEC_RELEASE_SMOKE_PASSWORD: 'SyntheticSmokePassword',
    });
    const result = await execute(
      process.execPath,
      ['--import', 'tsx', '--import', pathToFileURL(preload).href, releaseScript, ...args],
      { cwd: root, env, timeout: 15_000 },
    ).then(
      ({ stdout, stderr }) => ({ code: 0, stdout, stderr }),
      (error: unknown) => {
        const failure = error as ExecFileException & { stdout: string; stderr: string };
        return { code: failure.code, stdout: failure.stdout, stderr: failure.stderr };
      },
    );
    return { ...result, calls: JSON.parse(await readFile(log, 'utf8')) as ReleaseCall[] };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const published = (calls: ReleaseCall[]) => calls.some((call) => call.kind === 'push');
const deployed = (calls: ReleaseCall[]) => calls.some((call) => call.kind === 'convex');

test('production release checks quality, deploys the explicit Convex target, then pushes the checked SHA', async () => {
  const result = await runRelease('success');
  assert.equal(result.code, 0, result.stderr);
  const phases = result.calls.map((call) => call.kind);
  assert.ok(phases.indexOf('push-preflight') < phases.indexOf('quality'));
  assert.ok(phases.indexOf('quality') < phases.indexOf('convex'));
  assert.ok(phases.indexOf('convex') < phases.indexOf('runtime-prepare'));
  assert.ok(phases.indexOf('runtime-prepare') < phases.indexOf('push'));
  assert.ok(phases.indexOf('maintenance-pause') < phases.indexOf('convex'));
  assert.ok(phases.indexOf('scheduled-inventory') < phases.indexOf('convex'));
  assert.ok(phases.indexOf('push') < phases.indexOf('vercel-status'));
  assert.ok(phases.indexOf('portal-smoke') < phases.indexOf('maintenance-resume'));
  assert.ok(phases.indexOf('operational-smoke') < phases.indexOf('maintenance-resume'));
  assert.ok(phases.indexOf('maintenance-authorizeSmoke') < phases.indexOf('operational-smoke'));
  assert.ok(phases.indexOf('operational-smoke') < phases.indexOf('maintenance-endSmoke'));
  assert.match(result.stdout, /Acesso liberado/);
  const convex = result.calls.find((call) => call.kind === 'convex');
  assert(convex);
  assert.equal(convex.targetFile, 'CONVEX_DEPLOYMENT=prod:exuberant-cheetah-138\n');
  assert.deepEqual(convex.env, {
    CONVEX_DEPLOYMENT: 'prod:exuberant-cheetah-138',
    VITE_CONVEX_URL: 'https://exuberant-cheetah-138.convex.cloud',
    VITE_CONVEX_SITE_URL: 'https://exuberant-cheetah-138.convex.site',
  });
  assert.equal(
    convex.args[convex.args.indexOf('--cmd') + 1],
    'node --import tsx scripts/assert-production-target.ts',
  );
  assert.equal(
    convex.args[convex.args.indexOf('--cmd-url-env-var-name') + 1],
    'DENTEC_DEPLOYMENT_URL',
  );
  assert.equal(convex.args[convex.args.indexOf('--message') + 1], 'main ' + commit);
  const push = result.calls.find((call) => call.kind === 'push');
  assert(push);
  assert.deepEqual(push.args, ['push', 'origin', commit + ':refs/heads/main']);
});

test('failed quality checks prevent both Convex deployment and Git publication', async () => {
  const result = await runRelease('quality-failed');
  assert.equal(result.code, 1);
  assert.ok(result.calls.some((call) => call.kind === 'quality'));
  assert.equal(deployed(result.calls), false);
  assert.equal(published(result.calls), false);
});

test('a failed Convex schema deployment prevents Git publication', async () => {
  const result = await runRelease('schema-failed');
  assert.equal(result.code, 1);
  assert.equal(deployed(result.calls), true);
  assert.equal(published(result.calls), false);
  assert.match(result.stderr, /Confira o estado no dashboard antes de repetir/);
});

test('untracked source code prevents release before any remote subprocess', async () => {
  const result = await runRelease('untracked');
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Faça commit/);
  assert.ok(result.calls.every((call) => call.kind === 'git-read'));
});

test('ignored files inside convex prevent release before any remote subprocess', async () => {
  const result = await runRelease('ignored');
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Mova os arquivos ignorados de convex/);
  assert.ok(result.calls.every((call) => call.kind === 'git-read'));
});

test('changing HEAD during quality checks blocks deployment and publication', async () => {
  const result = await runRelease('head-changed');
  assert.equal(result.code, 1);
  assert.match(result.stderr, /branch ou o commit mudou/);
  assert.ok(result.calls.some((call) => call.kind === 'quality'));
  assert.equal(deployed(result.calls), false);
  assert.equal(published(result.calls), false);
});

test('release dry-run does not invoke even a Git or quality subprocess', async () => {
  const result = await runRelease('success', ['--dry-run']);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.calls, []);
});

test('release refuses unavailable or lost admission control before removing backend contracts', async () => {
  for (const scenario of ['control-unavailable', 'control-lost']) {
    const result = await runRelease(scenario);
    assert.equal(result.code, 1);
    assert.equal(deployed(result.calls), false);
    assert.equal(published(result.calls), false);
    assert.equal(
      result.calls.some((call) => call.kind === 'maintenance-resume'),
      false,
    );
  }
});

test('frontend build and smoke failures keep maintenance active after backend publication', async () => {
  for (const scenario of ['vercel-failed', 'smoke-failed', 'html-smoke-failed']) {
    const result = await runRelease(scenario);
    assert.equal(result.code, 1);
    assert.equal(deployed(result.calls), true);
    assert.equal(published(result.calls), true);
    assert.equal(
      result.calls.some((call) => call.kind === 'maintenance-resume'),
      false,
    );
    assert.match(result.stderr, /manutenção permanece ativa/);
  }
});

test('unknown scheduled identities prevent removing application contracts', async () => {
  for (const scenario of ['unknown-scheduled']) {
    const result = await runRelease(scenario);
    assert.equal(result.code, 1);
    assert.equal(deployed(result.calls), false);
    assert.equal(published(result.calls), false);
    assert.equal(
      result.calls.some((call) => call.kind === 'maintenance-resume'),
      false,
    );
  }
});

test('release preflight rejects emergency, invalid smoke identity, missing browser and an uncoordinated published commit before pause', async () => {
  for (const scenario of [
    'emergency',
    'invalid-smoke-identity',
    'browser-missing',
    'already-published',
  ]) {
    const result = await runRelease(scenario);
    assert.equal(result.code, 1);
    assert.equal(
      result.calls.some((call) => call.kind === 'maintenance-pause'),
      false,
    );
    assert.equal(deployed(result.calls), false);
  }
  const retry = await runRelease('retry-published');
  assert.equal(retry.code, 0, retry.stderr);
});

test('ambiguous pause or smoke authorization report the remaining gate and always try to revoke smoke', async () => {
  const paused = await runRelease('pause-unknown');
  assert.equal(paused.code, 1);
  assert.match(paused.stderr, /manutenção pode estar ativa/);
  assert.equal(deployed(paused.calls), false);
  const authorized = await runRelease('smoke-authorization-unknown');
  assert.equal(authorized.code, 1);
  assert.ok(authorized.calls.some((call) => call.kind === 'maintenance-endSmoke'));
  const cleanup = await runRelease('smoke-cleanup-failed');
  assert.equal(cleanup.code, 1);
  assert.match(cleanup.stderr, /conta restrita pode continuar autorizada/);
  assert.equal(
    cleanup.calls.some((call) => call.kind === 'maintenance-resume'),
    false,
  );
  const both = await runRelease('smoke-and-cleanup-failed');
  assert.equal(both.code, 1);
  assert.match(both.stderr, /Falhou:/);
  assert.match(both.stderr, /conta restrita pode continuar autorizada/);
});

test('Vercel confirmation credentials are required before entering maintenance', async () => {
  const result = await runRelease('missing-vercel-token');
  assert.equal(result.code, 1);
  assert.equal(deployed(result.calls), false);
  assert.equal(
    result.calls.some((call) => call.kind === 'maintenance-pause'),
    false,
  );
  assert.match(result.stderr, /VERCEL_TOKEN/);
});

test('release preserves maintenance when PDF runtime preparation fails after backend deployment', async () => {
  const result = await runRelease('runtime-failed');
  assert.notEqual(result.code, 0);
  assert.equal(deployed(result.calls), true);
  assert.equal(published(result.calls), false);
  assert.equal(
    result.calls.some((call) => call.kind === 'maintenance-resume'),
    false,
  );
  assert.match(result.stderr, /manutenção permanece ativa/);
});
