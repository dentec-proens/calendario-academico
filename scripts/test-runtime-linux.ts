import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The serverless PDF runtime requires Linux. Keep this optional local Docker
// command separate from browser tests and never copy deployment credentials.
const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
  packageManager: string;
  devDependencies: { '@playwright/test': string };
};
const playwrightVersion = manifest.devDependencies['@playwright/test'];
if (!/^\d+\.\d+\.\d+$/.test(playwrightVersion)) {
  throw new Error('Fixe a versão exata de @playwright/test para o teste local do runtime PDF.');
}
const packageManager = /^pnpm@(\d+\.\d+\.\d+)$/.exec(manifest.packageManager);
if (!packageManager) throw new Error('Fixe uma versão exata de pnpm em packageManager.');
const image = `mcr.microsoft.com/playwright:v${playwrightVersion}-noble`;
const sources = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'vitest.runtime.config.ts',
  'tsconfig.base.json',
  'test/runtime',
  'src',
  'assets',
  'convex',
  'config',
  'scripts/print-assets.ts',
  'scripts/chromium-resources.ts',
  'scripts/environment.ts',
];
const work = await mkdtemp(join(tmpdir(), 'calendario-runtime-linux-'));

try {
  for (const source of sources)
    await cp(join(root, source), join(work, source), { recursive: true });
  const result = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--init',
      '--ipc=host',
      '--platform=linux/amd64',
      '--volume',
      `${resolve(work)}:/work`,
      '--workdir',
      '/work',
      image,
      'bash',
      '-euc',
      `npm install --global pnpm@${packageManager[1]}; pnpm install --frozen-lockfile; pnpm test:runtime "$@"`,
      'runtime',
      ...args,
    ],
    { stdio: 'inherit', cwd: root },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(work, { recursive: true, force: true });
}
