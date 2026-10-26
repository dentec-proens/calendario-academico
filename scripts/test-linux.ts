import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Use the CI image on every host, without replacing the host's node_modules or
// copying local environment files into the container's working directory.
const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
  packageManager: string;
  devDependencies: { '@playwright/test': string };
};
const playwrightVersion = manifest.devDependencies['@playwright/test'];
if (!/^\d+\.\d+\.\d+$/.test(playwrightVersion)) {
  throw new Error('Fixe a versão exata de @playwright/test para reproduzir o ambiente de CI.');
}
const packageManager = /^pnpm@(\d+\.\d+\.\d+)$/.exec(manifest.packageManager);
if (!packageManager) throw new Error('Fixe uma versão exata de pnpm em packageManager.');
const image = `mcr.microsoft.com/playwright:v${playwrightVersion}-noble`;
const mode = args[0] === '--runtime' ? 'runtime' : args[0] === '--all' ? 'all' : 'browser';
if (mode !== 'browser') args.shift();
const testCommand =
  mode === 'runtime'
    ? 'pnpm test:runtime "$@"'
    : mode === 'all'
      ? 'pnpm test:runtime; pnpm exec playwright test "$@"'
      : 'pnpm exec playwright test "$@"';
const sources = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'playwright.config.ts',
  'vitest.runtime.config.ts',
  'tsconfig.base.json',
  'tsconfig.test.json',
  'test',
  'web',
  'src',
  'assets',
  'convex',
  'config',
  'scripts/print-assets.ts',
  'scripts/chromium-resources.ts',
  'scripts/environment.ts',
];
const work = await mkdtemp(join(tmpdir(), 'calendario-tests-linux-'));

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
      '--env',
      'CI=true',
      image,
      'bash',
      '-euc',
      `npm install --global pnpm@${packageManager[1]}; pnpm install --frozen-lockfile; ${testCommand}`,
      mode,
      ...args,
    ],
    { stdio: 'inherit', cwd: root },
  );
  // Missing artifacts are normal if Docker or dependency installation failed.
  for (const artifact of ['playwright-report', 'test-results']) {
    await cp(join(work, artifact), join(root, artifact), { recursive: true, force: true }).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      },
    );
  }
  // Never replace reference screenshots after a failing or partial update.
  if (
    result.status === 0 &&
    args.some(
      (argument) =>
        argument === '--update-snapshots' ||
        /^--update-snapshots=(all|changed|missing)$/.test(argument),
    )
  ) {
    const snapshots = join(root, 'test/browser/__screenshots__');
    await mkdir(snapshots, { recursive: true });
    await cp(join(work, 'test/browser/__screenshots__'), snapshots, {
      recursive: true,
      filter: (source) => !['darwin', 'win32'].includes(basename(source)),
    });
  }
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(work, { recursive: true, force: true });
}
