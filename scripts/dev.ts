import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { writePrintAssets } from './print-assets.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const convexCli = fileURLToPath(new URL('../node_modules/convex/bin/main.js', import.meta.url));
let backend: ChildProcess | undefined;
let frontend: ViteDevServer | undefined;
let stopping = false;

async function stop(code = 0): Promise<void> {
  if (stopping) return;
  stopping = true;
  backend?.kill();
  await frontend?.close();
  process.exitCode = code;
}
process.once('SIGINT', () => {
  void stop();
});
process.once('SIGTERM', () => {
  void stop();
});

try {
  await writePrintAssets();
  await new Promise<void>((resolve, reject) => {
    const setup = spawn(process.execPath, [convexCli, 'dev', '--once'], {
      cwd: root,
      stdio: 'inherit',
    });
    backend = setup;
    setup.once('error', reject);
    setup.once('exit', (code) =>
      code === 0 ? resolve() : reject(Error('Não foi possível preparar o Convex.')),
    );
  });
  if (!stopping) {
    backend = spawn(process.execPath, [convexCli, 'dev'], { cwd: root, stdio: 'inherit' });
    backend.once('error', (error) => {
      console.error(error.message);
      void stop(1);
    });
    backend.once('exit', (code, signal) => {
      void stop(signal ? 0 : (code ?? 1));
    });
    frontend = await createServer({
      configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    });
    if (stopping) await frontend.close();
    else {
      await frontend.listen();
      frontend.printUrls();
    }
  }
} catch (error) {
  if (!stopping)
    console.error(error instanceof Error ? error.message : 'Não foi possível iniciar o portal.');
  await stop(1);
}
