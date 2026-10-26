import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { configuredE2ETarget, readE2EEnvironment } from './e2e-environment.ts';
import { root } from './environment.ts';

const environment = readE2EEnvironment();
const target = configuredE2ETarget(environment);
console.log(
  `E2E: ${target.mode}, frontend ${target.base}. Somente registros criados pela suíte são alterados.`,
);
const child = spawn(
  process.execPath,
  [
    fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url)),
    'test',
    '--config=playwright.e2e.config.ts',
    ...process.argv.slice(2),
  ],
  { cwd: root, env: environment, stdio: 'inherit' },
);
child.once('error', () => {
  process.exitCode = 1;
});
child.once('exit', (code) => {
  process.exitCode = code ?? 1;
});
