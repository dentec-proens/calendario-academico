import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { root } from './environment.ts';

// Independent fast steps run together; the browser suite runs alone afterwards because it
// needs every core and its timing-sensitive tests degrade under contention.
const parallel = [
  'format:check',
  'lint',
  'lint:types',
  'typecheck:app',
  'typecheck:convex',
  'typecheck:tools',
  'typecheck:tests',
  'agents:check',
  'build',
  'test:unit',
];
const children = new Set<ChildProcess>();
let stopped = false;
const seconds = (start: number) => ((performance.now() - start) / 1000).toFixed(1) + 's';

function run(script: string, capture: boolean) {
  const start = performance.now();
  return new Promise<{ ok: boolean; killed: boolean; output: string; time: string }>((resolve) => {
    // Each step leads its own process group so stopping it also stops tsc, vitest or vite.
    const child = spawn('pnpm', ['run', '--silent', script], {
      cwd: root,
      detached: true,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? '1' },
    });
    children.add(child);
    let output = '';
    child.stdout?.on('data', (chunk: Buffer) => (output += chunk));
    child.stderr?.on('data', (chunk: Buffer) => (output += chunk));
    child.once('error', (error) => {
      children.delete(child);
      resolve({ ok: false, killed: false, output: output + error, time: seconds(start) });
    });
    child.once('exit', (code, signal) => {
      children.delete(child);
      resolve({ ok: code === 0, killed: signal !== null, output, time: seconds(start) });
    });
  });
}

function stop() {
  stopped = true;
  for (const child of children) {
    try {
      process.kill(-child.pid!, 'SIGTERM');
    } catch {
      // The step already exited.
    }
  }
}
process.once('SIGINT', () => {
  stop();
  process.exit(130);
});

const start = performance.now();
const failures: { script: string; output: string; time: string }[] = [];
await Promise.all(
  parallel.map(async (script) => {
    const result = await run(script, true);
    if (result.ok) console.log(`✓ ${script} ${result.time}`);
    else if (!(stopped && result.killed)) {
      failures.push({ script, ...result });
      stop();
    }
  }),
);
for (const failure of failures)
  console.error(`\n✗ ${failure.script} ${failure.time}\n${failure.output.trimEnd()}`);
if (failures.length) {
  console.error(`\npnpm check falhou em ${failures[0]!.script} após ${seconds(start)}.`);
  process.exit(1);
}

const browser = await run('test:browser', false);
console.log(`${browser.ok ? '✓' : '✗'} test:browser ${browser.time}`);
console.log(`pnpm check ${browser.ok ? 'concluído' : 'falhou'} em ${seconds(start)}.`);
process.exit(browser.ok ? 0 : 1);
