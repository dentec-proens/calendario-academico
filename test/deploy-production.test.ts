import { test, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { changesBackend } from '../scripts/release-backend.ts';

const execute = promisify(execFile);
const commit = 'a'.repeat(40);
const backend = 'b'.repeat(40);
// Every subprocess and HTTP request is intercepted. Unknown calls fail closed;
// these tests never invoke Git, publish Convex or access any remote deployment.
const preloadSource = String.raw`
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import fs, { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const scenario = process.env.SCENARIO;
const fast = process.env.FAST_RELEASE === '1';
const calls = [];
const commit = 'a'.repeat(40), baseline = 'b'.repeat(40);
const expanded = scenario.startsWith('backend-') && scenario !== 'backend-changed';
const afterFast = scenario === 'after-fast' || scenario === 'backend-after-fast';
const normalReceipt = scenario.startsWith('fast-normal-');
const installedEndpoint = afterFast || scenario === 'fast-pending' || normalReceipt && scenario !== 'fast-normal-legacy';
const originalRead = fs.readFileSync;
const packageContent = originalRead(path.join(process.cwd(),'package.json'),'utf8');
const plan = {version:1,baseline,strategy:'expand',guarantees:{oldClients:true,oldWriters:true,scheduledFunctions:true,sessions:true},rationale:'Expansão comprovada para clientes antigos, escritores, sessões e migração aditiva.',tests:['test/release-contracts.test.ts'],migrations:[{id:'fill-label',table:'campuses',field:'releaseLabel',source:{kind:'literal',value:'Label'}}]};
fs.readFileSync = (path,...args) => String(path).replaceAll('\\','/').endsWith('/release/plan.json') && (expanded || scenario === 'fast-migrations') ? JSON.stringify(plan) : originalRead(path,...args);
const resumed = scenario.includes('resume');
function canonical(value) {if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,item])=>JSON.stringify(key)+':'+canonical(item)).join(',')+'}';return JSON.stringify(value)??'null';}
const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
const releaseFunction={kind:'query',visibility:'internal',args:{type:'object',value:{}},returns:null};
function snapshot(candidate) {return {schema:{schemaValidation:true,tables:[{tableName:'campuses',documentType:{type:'object',value:{name:{fieldType:{type:'string'},optional:false},...(candidate?{releaseLabel:{fieldType:{type:'string'},optional:true}}:{})}},indexes:[],searchIndexes:[],vectorIndexes:[]}]},functions:candidate || afterFast?{'releases.js:status':releaseFunction,...(afterFast?{'releases.js:installed':releaseFunction}:{})}:{}};}
let snapshotDirectory;
let staged = false;
let checked = false, manual = false, promoted = scenario==='backend-resume-promoted', reads = 0, didDeploy = resumed, batchReads = 0;
let ledger = resumed ? {commit,previousBackend:baseline,previousFrontend:'dpl_old',owner:'f'.repeat(40),planHash:hash(plan),contractHash:hash(snapshot(true)),phase:scenario==='backend-resume-promoted'?'validated':'expanded',...(scenario==='backend-resume-promoted'?{candidateId:'dpl_new'}:{})} : null;
if (afterFast || scenario === 'fast-pending') ledger = {mode:'fast',commit:baseline,owner:'f'.repeat(40),phase:scenario === 'fast-pending'?'published':'complete'};
if (normalReceipt) ledger = {commit:baseline,previousBackend:'c'.repeat(40),previousFrontend:'dpl_old',owner:'f'.repeat(40),planHash:hash(plan),contractHash:hash(snapshot(true)),phase:scenario==='fast-normal-pending'?'expanded':'complete',plan,migrations:[]};
function record(name) { calls.push(name); writeFileSync(process.env.LOG, JSON.stringify(calls)); }
writeFileSync(process.env.LOG, '[]');
childProcess.execFileSync = (command, args, options) => {
  if (command === process.execPath && args.some(arg=>arg.endsWith('release-contract-snapshot.ts'))) {
    const candidate = fs.realpathSync(args.at(-1)) === fs.realpathSync(process.cwd());
    return JSON.stringify(snapshot(candidate));
  }
  if (command === process.execPath && args[1] === 'function-spec') {record('function-spec'); return JSON.stringify({url:'https://exuberant-cheetah-138.convex.cloud',functions:didDeploy || scenario==='fresh-controls' || afterFast || scenario==='fast-pending' || normalReceipt? [{identifier:'releases.js:status',functionType:'Query',visibility:{kind:'internal'},args:releaseFunction.args,returns:null},...((installedEndpoint || didDeploy && fast)?[{identifier:'releases.js:installed',functionType:'Query',visibility:{kind:'internal'},args:releaseFunction.args,returns:null}]:[])]:[]});}
  if (command === process.execPath && args[1] === 'run') {
    const name = args[2]; record(name);
    if (name === 'operations:status') return JSON.stringify({emergency:scenario==='emergency',paused:scenario==='paused',commit:scenario==='missing-baseline'?null:baseline,active:[{id:'busy',operation:'pdf',startedAt:1}]});
    if (name === 'releases:begin') {record('begin-payload '+args[3]);ledger={...JSON.parse(args[3]),phase:resumed?ledger.phase:'expanded'};return 'null';}
    if (name === 'releases:fastPublished') {record('fast-published-payload '+args[3]);if(scenario==='fast-published-failed')throw Error('Registration failed');ledger={...JSON.parse(args[3]),mode:'fast',phase:'published'};return 'null';}
    if (name === 'releases:fastComplete') {if(scenario==='fast-receipt-failed')throw Error('Receipt failed');ledger.phase='complete';return 'null';}
    if (name === 'releases:status' || name === 'releases:installed') return ledger ? JSON.stringify(ledger) : '';
    if (name === 'releases:batch') {if(scenario==='backend-migration-failed')throw Error('Invalid batch');batchReads++;return JSON.stringify({done:batchReads%2===0,count:2});}
    if (name === 'releases:validated') {ledger.phase='validated';return 'null';}
    if (name === 'releases:complete') {ledger.phase='complete';return 'null';}
    if (name === 'operations:smokePreflight') return 'null';
    throw Error('Unexpected operational call ' + name);
  }
  if (command !== 'git') throw Error('Unexpected executable');
  const op = args.join(' ');
  record('git '+op);
  const isolated = options?.cwd === snapshotDirectory;
  if(args[0] === 'worktree' && args[1] === 'add') {
    snapshotDirectory=args[3];
    fs.mkdirSync(snapshotDirectory,{recursive:true});
    for(const name of ['scripts','config','convex','release']) fs.cpSync(path.join(process.cwd(),name),path.join(snapshotDirectory,name),{recursive:true});
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
  if (op === 'rev-parse HEAD') return (checked || staged) && (scenario==='head-changed'&&!isolated || scenario==='snapshot-head-changed'&&isolated)?'c'.repeat(40):commit;
  if (args[0] === 'diff') return scenario==='backend-changed' || expanded?'convex/calendars.ts':'web/app.ts';
  if (args[0] === 'show') return packageContent;
  if (args[0] === 'archive') return Buffer.alloc(1024);
  if (args[0] === 'commit-tree') return 'd'.repeat(40);
  throw Error('Unexpected Git read '+op);
};
childProcess.spawnSync = (command, args, options) => {
  if(command==='pnpm' && args[0]==='install') {record('snapshot-install');return {status:scenario==='snapshot-install-failed'?1:0};}
  if (args.includes('check') || args.includes('pnpm check')) { record('quality'); checked=true; return {status:scenario==='quality-failed'?1:0}; }
  if (command === 'git' && ['fetch','merge-base','push'].includes(args[0])) {
    record('git '+args.join(' '));
    return {status: scenario==='locked' && args.some(a=>a.includes(':refs/heads/codex/production-release-lock')) ? 1:0};
  }
  if (command === process.execPath && args[1] === 'deploy') {record('backend-deploy');if(fast){if(args.includes('--typecheck'))throw Error('Unexpected typecheck override');record('convex-default-typecheck');}didDeploy=true;return {status:scenario==='backend-deploy-failed'||scenario==='fast-deploy-failed'?1:0};}
  if (command === process.execPath && args[1] === 'export') {record('backup');fs.writeFileSync(args[args.indexOf('--path')+1],Buffer.concat([Buffer.from([80,75,3,4]),Buffer.alloc(100)]));return {status:scenario==='backend-backup-failed'?1:0};}
  if (args.includes('scripts/release-session-probe.ts')) {const mode=args[3];record('session '+mode);return {status:mode==='verify'&&scenario==='backend-session-lost'?1:0};}
  if (args.includes('scripts/release-smoke.ts')) {
    const preflight = args.includes('--check-browser'); record(preflight?'browser':'smoke '+options.env.DENTEC_RELEASE_CANDIDATE_URL);
    return {status:!preflight && (scenario==='smoke-failed' || scenario==='backend-old-smoke-failed' && options.env.DENTEC_RELEASE_CANDIDATE_URL==='https://old.vercel.app')?1:0};
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
  if(u.pathname==='/v13/deployments/calendario-academico-phi.vercel.app') { reads++; return Response.json(deployment(promoted || (scenario==='concurrent' && reads>1)?'dpl_new':'dpl_old',promoted?commit:baseline)); }
  if(u.pathname==='/v13/deployments'&&method==='POST') { if(!manual) throw Error('Unsafe creation'); staged=true; return Response.json({id:'dpl_new'}); }
  if(u.pathname==='/v13/deployments/dpl_old')return Response.json(deployment('dpl_old',baseline));
  if(u.pathname==='/v13/deployments/dpl_new') {const d=deployment('dpl_new',scenario==='wrong-sha'?'c'.repeat(40):commit);return Response.json(d);}
  if(u.pathname==='/v10/projects/'+projectId+'/promote/dpl_new'&&method==='POST') {promoted=true;manual=false;if(scenario==='promotion-unknown') throw Error('Lost response');if(scenario.endsWith('promotion-empty'))return new Response(null,{status:202});return Response.json({});}
  throw Error('Unexpected Vercel call '+method+' '+u.pathname);
};
syncBuiltinESMExports();
`;
async function release(scenario: string, args: string[] = [], fast = false) {
  const dir = await mkdtemp(join(tmpdir(), 'release-online-test-'));
  try {
    const preload = join(dir, 'preload.mjs'),
      log = join(dir, 'calls.json');
    await writeFile(preload, preloadSource);
    const env = {
      ...process.env,
      SCENARIO: scenario,
      FAST_RELEASE: fast ? '1' : '0',
      LOG: log,
      DENTEC_RELEASE_BACKUP_DIR: dir,
      npm_execpath: 'pnpm',
      VERCEL_TOKEN: 'synthetic-token',
      DENTEC_RELEASE_BACKEND_COMMIT:
        scenario === 'missing-receipt'
          ? ''
          : [
                'wrong-receipt',
                'after-fast',
                'backend-after-fast',
                'fast-normal-complete',
                'fast-normal-legacy',
                'fast-normal-pending',
              ].includes(scenario)
            ? 'e'.repeat(40)
            : backend,
      DENTEC_RELEASE_SMOKE_USER_ID: 'user',
      DENTEC_RELEASE_SMOKE_CALENDAR_ID: 'calendar',
      DENTEC_RELEASE_SMOKE_EMAIL: 'test@example.com',
      DENTEC_RELEASE_SMOKE_PASSWORD: 'synthetic-password',
    };
    for (const key of [
      'CONVEX_DEPLOY_KEY',
      'CONVEX_DEPLOYMENT_TOKEN',
      'CONVEX_SELF_HOSTED_URL',
      'CONVEX_SELF_HOSTED_ADMIN_KEY',
    ])
      delete (env as NodeJS.ProcessEnv)[key];
    const result = await execute(
      process.execPath,
      [
        '--import',
        'tsx',
        '--import',
        pathToFileURL(preload).href,
        fileURLToPath(
          new URL(
            fast ? '../scripts/deploy-production-fast.ts' : '../scripts/deploy-production.ts',
            import.meta.url,
          ),
        ),
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
test('online release stages exact SHA, smokes immutable URL, then promotes; active actions continue', async () => {
  const result = await release('success');
  expect(result.code, result.stderr).toBe(0);
  const calls = result.calls;
  expect(calls.indexOf('quality')).toBeLessThan(calls.indexOf('POST /v13/deployments'));
  expect(calls.indexOf('PATCH /v9/projects/prj_AlAdqLCrChRgLBS1wRnjif72pF01')).toBeLessThan(
    calls.indexOf(`git push origin ${commit}:refs/heads/main`),
  );
  expect(calls.indexOf('POST /v13/deployments')).toBeLessThan(
    calls.indexOf('smoke https://candidate.vercel.app'),
  );
  expect(calls.indexOf('smoke https://candidate.vercel.app')).toBeLessThan(
    calls.indexOf('POST /v10/projects/prj_AlAdqLCrChRgLBS1wRnjif72pF01/promote/dpl_new'),
  );
  expect(calls.filter((c) => c.startsWith('PATCH '))).toHaveLength(2);
  expect(
    calls.some((c) =>
      c.includes(`--force-with-lease=refs/heads/codex/production-release-lock:${'d'.repeat(40)}`),
    ),
  ).toBe(true);
  expect(calls.some((c) => /operations:(pause|resume|authorizeSmoke)| deploy /.test(c))).toBe(
    false,
  );
});
test.each([
  'dirty',
  'head-changed',
  'quality-failed',
  'backend-changed',
  'missing-baseline',
  'missing-receipt',
  'wrong-receipt',
  'paused',
  'emergency',
  'locked',
  'auto-alias',
  'build-failed',
  'wrong-sha',
  'wrong-project',
  'smoke-failed',
  'concurrent',
])('failure %s never promotes or deploys the backend', async (scenario) => {
  const result = await release(scenario);
  expect(result.code, result.stderr).not.toBe(0);
  expect(result.calls.some((c) => c.startsWith('POST /v10/'))).toBe(false);
  expect(result.calls.some((c) => /operations:(pause|resume)| deploy /.test(c))).toBe(false);
});
test('dry-run has no subprocesses or platform requests', async () => {
  const result = await release('success', ['--dry-run']);
  expect(result.code).toBe(0);
  expect(result.calls).toEqual([]);
});
test('backend detection includes shared code, schema, runtime and dependencies', () => {
  expect(changesBackend(['web/editor.tsx', 'docs/uso.md'])).toBe(false);
  for (const path of [
    'convex/schema.ts',
    'src/calendar-base/index.ts',
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

test('ambiguous promotion preserves the reservation and reasserts manual domains without rolling back data', async () => {
  const result = await release('promotion-unknown');
  expect(result.code).not.toBe(0);
  expect(result.stderr).toContain('A promoção pode ter ocorrido');
  expect(result.calls.filter((c) => c.startsWith('PATCH '))).toHaveLength(2);
  expect(
    result.calls.some((c) => c.endsWith('origin :refs/heads/codex/production-release-lock')),
  ).toBe(false);
});

test('compatible backend release exports first, deploys, migrates and verifies both frontends before promotion', async () => {
  const result = await release('backend-success');
  expect(result.code, result.stderr).toBe(0);
  const calls = result.calls;
  for (const [first, second] of [
    ['POST /v13/deployments', 'backup'],
    ['backup', 'backend-deploy'],
    ['session start', 'backend-deploy'],
    ['backend-deploy', 'releases:begin'],
    ['releases:begin', 'releases:batch'],
    ['releases:batch', 'smoke https://old.vercel.app'],
    ['smoke https://old.vercel.app', 'smoke https://candidate.vercel.app'],
    ['smoke https://candidate.vercel.app', 'releases:validated'],
    ['releases:validated', 'POST /v10/projects/prj_AlAdqLCrChRgLBS1wRnjif72pF01/promote/dpl_new'],
    ['POST /v10/projects/prj_AlAdqLCrChRgLBS1wRnjif72pF01/promote/dpl_new', 'releases:complete'],
  ])
    expect(calls.indexOf(first!)).toBeLessThan(calls.indexOf(second!));
  expect(calls.filter((c) => c === 'session verify')).toHaveLength(3);
  expect(calls.at(-2)).toBe('session finish');
  expect(calls.some((c) => /operations:(pause|resume)/.test(c))).toBe(false);
});
test.each([
  'backend-backup-failed',
  'backend-deploy-failed',
  'backend-migration-failed',
  'backend-session-lost',
  'backend-old-smoke-failed',
])('%s prevents promotion and does not roll back data', async (scenario) => {
  const result = await release(scenario);
  expect(result.code).not.toBe(0);
  expect(result.calls.some((c) => c.startsWith('POST /v10/'))).toBe(false);
  expect(result.calls.includes('releases:complete')).toBe(false);
  expect(result.calls.some((c) => /operations:(pause|resume)/.test(c))).toBe(false);
  expect(result.calls.includes('session finish')).toBe(true);
});

test.each(['backend-resume', 'backend-resume-promoted'])(
  '%s retains checkpoints and verifies the same release without redeploying or rolling back',
  async (scenario) => {
    const result = await release(scenario, ['--resume']);
    expect(result.code, result.stderr).toBe(0);
    expect(result.calls.includes('backend-deploy')).toBe(false);
    expect(result.calls.includes('backup')).toBe(false);
    expect(result.calls.includes('releases:complete')).toBe(true);
    expect(
      result.calls.some((c) =>
        c.includes(`--force-with-lease=refs/heads/codex/production-release-lock:${'f'.repeat(40)}`),
      ),
    ).toBe(true);
    if (scenario === 'backend-resume-promoted')
      expect(result.calls.some((c) => c.startsWith('POST /v10/'))).toBe(false);
  },
);

test('installed controls without a receipt parse the CLI empty null response safely', async () => {
  const result = await release('fresh-controls');
  expect(result.code, result.stderr).toBe(0);
});

test('empty promotion response completes the backend receipt and releases the reservation', async () => {
  const result = await release('backend-promotion-empty');
  expect(result.code, result.stderr).toBe(0);
  expect(result.calls.includes('releases:complete')).toBe(true);
  expect(result.calls.filter((call) => call.startsWith('POST /v10/'))).toHaveLength(1);
  expect(
    result.calls.some((call) => call.endsWith('origin :refs/heads/codex/production-release-lock')),
  ).toBe(true);
});

test('fast release builds Production, deploys Convex with default typecheck and promotes without quality suites or smoke', async () => {
  const result = await release('success', [], true);
  expect(result.code, result.stderr).toBe(0);
  const calls = result.calls;
  for (const [first, second] of [
    ['POST /v13/deployments', 'backend-deploy'],
    ['backend-deploy', 'releases:fastPublished'],
    [
      'releases:fastPublished',
      'POST /v10/projects/prj_AlAdqLCrChRgLBS1wRnjif72pF01/promote/dpl_new',
    ],
    [
      'POST /v10/projects/prj_AlAdqLCrChRgLBS1wRnjif72pF01/promote/dpl_new',
      'releases:fastComplete',
    ],
  ])
    expect(calls.indexOf(first!)).toBeLessThan(calls.indexOf(second!));
  expect(calls).toContain('convex-default-typecheck');
  expect(
    calls.some((call) =>
      /^(quality|browser|smoke |session |backup|releases:(begin|batch|validated|complete)$)/.test(
        call,
      ),
    ),
  ).toBe(false);
  const payload = JSON.parse(
    calls
      .find((call) => call.startsWith('fast-published-payload '))!
      .slice('fast-published-payload '.length),
  );
  expect(payload).toMatchObject({ commit, previousBackend: backend, candidateId: 'dpl_new' });
  const unlock = calls.findIndex((call) =>
    call.endsWith('origin :refs/heads/codex/production-release-lock'),
  );
  expect(unlock).toBeGreaterThan(calls.indexOf('releases:fastComplete'));
  expect(calls.at(-1)).toContain('git worktree remove --force');
});

test.each([
  'snapshot-dirty',
  'snapshot-head-changed',
  'snapshot-install-failed',
  'missing-receipt',
  'wrong-receipt',
  'paused',
  'emergency',
  'locked',
  'auto-alias',
  'build-failed',
  'wrong-sha',
  'wrong-project',
  'concurrent',
  'fast-migrations',
  'fast-pending',
])('fast failure %s prevents backend deployment and promotion', async (scenario) => {
  const result = await release(scenario, [], true);
  expect(result.code, result.stderr).not.toBe(0);
  expect(result.calls).not.toContain('backend-deploy');
  expect(result.calls.some((call) => call.startsWith('POST /v10/'))).toBe(false);
});

test.each([
  'fast-deploy-failed',
  'fast-published-failed',
  'promotion-unknown',
  'fast-receipt-failed',
])(
  'fast failure %s preserves the reservation and reports partial publication',
  async (scenario) => {
    const result = await release(scenario, [], true);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('Reserva preservada');
    expect(
      result.calls.some((call) =>
        call.endsWith('origin :refs/heads/codex/production-release-lock'),
      ),
    ).toBe(false);
    if (scenario === 'fast-deploy-failed')
      expect(result.calls).not.toContain('releases:fastPublished');
    if (scenario === 'fast-published-failed') {
      expect(result.calls).not.toContain('releases:fastComplete');
      expect(result.calls.some((call) => call.startsWith('POST /v10/'))).toBe(false);
    }
    expect(result.calls).not.toContain('releases:complete');
  },
);

test.each([{ args: ['--dry-run'] }, { args: ['--resume'] }, { args: ['--skip-checks'] }])(
  'fast invocation %j does not execute operations',
  async ({ args }) => {
    const result = await release('success', args, true);
    expect(result.code).toBe(args[0] === '--dry-run' ? 0 : 1);
    expect(result.calls).toEqual([]);
  },
);

test('normal release uses a completed fast receipt as backend baseline and keeps all checks', async () => {
  const result = await release('after-fast');
  expect(result.code, result.stderr).toBe(0);
  expect(result.calls).toContain('releases:installed');
  expect(result.calls).toContain('quality');
  expect(result.calls).toContain('smoke https://candidate.vercel.app');
  expect(result.calls).toContain(`git merge-base --is-ancestor ${backend} ${commit}`);
  expect(result.calls).not.toContain(`git merge-base --is-ancestor ${'e'.repeat(40)} ${commit}`);
});

test('normal release refuses to resume or overwrite a pending fast receipt', async () => {
  const result = await release('fast-pending');
  expect(result.code).not.toBe(0);
  expect(result.calls).not.toContain('backend-deploy');
  expect(result.calls.some((call) => call.startsWith('POST /v10/'))).toBe(false);
});

test('backend expansion after fast uses the installed commit instead of a stale bootstrap for snapshots and begin', async () => {
  const result = await release('backend-after-fast');
  expect(result.code, result.stderr).toBe(0);
  expect(result.calls).toContain(`git archive ${backend}`);
  const payload = JSON.parse(
    result.calls.find((call) => call.startsWith('begin-payload '))!.slice('begin-payload '.length),
  );
  expect(payload).toMatchObject({ previousBackend: backend, plan: { baseline: backend } });
  expect(result.calls).toContain('quality');
  expect(result.calls).toContain('smoke https://old.vercel.app');
  expect(result.calls).toContain('smoke https://candidate.vercel.app');
  expect(result.calls).toContain('releases:complete');
});

test.each(['fast-normal-complete', 'fast-normal-legacy'])(
  'fast release %s uses the normal receipt instead of stale bootstrap',
  async (scenario) => {
    const result = await release(scenario, [], true);
    expect(result.code, result.stderr).toBe(0);
    expect(result.calls).toContain(
      scenario === 'fast-normal-legacy' ? 'releases:status' : 'releases:installed',
    );
    const payload = JSON.parse(
      result.calls
        .find((call) => call.startsWith('fast-published-payload '))!
        .slice('fast-published-payload '.length),
    );
    expect(payload.previousBackend).toBe(backend);
    expect(result.calls).toContain('backend-deploy');
    expect(result.calls).toContain('releases:fastComplete');
    expect(result.calls).not.toContain('quality');
  },
);

test('fast release refuses a pending normal receipt before deployment or reservation', async () => {
  const result = await release('fast-normal-pending', [], true);
  expect(result.code).not.toBe(0);
  expect(result.stderr).toContain('Há uma release pendente');
  expect(result.calls).toContain('releases:installed');
  expect(result.calls).not.toContain('backend-deploy');
  expect(result.calls.some((call) => call.startsWith('POST /v13/'))).toBe(false);
  expect(result.calls.some((call) => call.startsWith('git push'))).toBe(false);
});

test('normal resume explains that a completed fast release needs no reconciliation', async () => {
  const result = await release('after-fast', ['--resume']);
  expect(result.code).not.toBe(0);
  expect(result.stderr).toContain('Fast release já concluída');
  expect(result.stderr).not.toContain('reconciliação manual');
  expect(result.calls.some((call) => call.startsWith('POST /v10/'))).toBe(false);
});

test.each(['dirty', 'head-changed'])(
  'fast release %s publishes the captured commit from an isolated checkout',
  async (scenario) => {
    const result = await release(scenario, [], true);
    expect(result.code, result.stderr).toBe(0);
    expect(result.calls).toContain('snapshot-install');
    expect(result.calls).toContain(`git push origin ${commit}:refs/heads/main`);
    expect(result.calls).toContain('backend-deploy');
    expect(result.calls).toContain('releases:fastComplete');
    expect(result.calls.some((call) => call.startsWith('git worktree add --detach'))).toBe(true);
    expect(result.calls.at(-1)).toContain('git worktree remove --force');
    expect(result.calls.some((call) => /git (stash|reset|clean|checkout)/.test(call))).toBe(false);
  },
);
