import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
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
  throw new Error('Unexpected Git read: ' + operation);
};

childProcess.spawnSync = (command, args, options) => {
  let kind;
  let status = 0;
  if (args.includes('check') || args.includes('pnpm check')) {
    kind = 'quality';
    checked = true;
    if (scenario === 'quality-failed') status = 1;
  } else if (command === 'git') {
    if (args[0] === 'fetch') kind = 'fetch';
    else if (args[0] === 'merge-base') kind = 'fast-forward';
    else if (args[0] === 'push') kind = args.includes('--dry-run') ? 'push-preflight' : 'push';
    else throw new Error('Unexpected Git write: ' + args.join(' '));
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
syncBuiltinESMExports();
`;

async function runRelease(scenario, args = []) {
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
      DENTEC_TEST_RELEASE_SCENARIO: scenario,
      DENTEC_TEST_RELEASE_LOG: log,
    });
    const result = await execute(
      process.execPath,
      ['--import', 'tsx', '--import', pathToFileURL(preload).href, releaseScript, ...args],
      { cwd: root, env, timeout: 15_000 },
    ).then(
      ({ stdout, stderr }) => ({ code: 0, stdout, stderr }),
      (error) => ({ code: error.code, stdout: error.stdout, stderr: error.stderr }),
    );
    return { ...result, calls: JSON.parse(await readFile(log, 'utf8')) };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const published = (calls) => calls.some((call) => call.kind === 'push');
const deployed = (calls) => calls.some((call) => call.kind === 'convex');

test('production release checks quality, deploys the explicit Convex target, then pushes the checked SHA', async () => {
  const result = await runRelease('success');
  assert.equal(result.code, 0, result.stderr);
  const phases = result.calls.map((call) => call.kind);
  assert.ok(phases.indexOf('push-preflight') < phases.indexOf('quality'));
  assert.ok(phases.indexOf('quality') < phases.indexOf('convex'));
  assert.ok(phases.indexOf('convex') < phases.indexOf('push'));
  const convex = result.calls.find((call) => call.kind === 'convex');
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
  assert.deepEqual(result.calls.find((call) => call.kind === 'push').args, [
    'push',
    'origin',
    commit + ':refs/heads/main',
  ]);
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
