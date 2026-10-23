import { spawn } from 'node:child_process';
import { convexCli, readDevEnvironment, root } from './environment.ts';

try {
  const env = { ...process.env, ...readDevEnvironment() };
  const child = spawn(process.execPath, [convexCli, 'dev', '--env-file', '.env.local'], {
    cwd: root,
    env,
    stdio: 'inherit',
  });
  child.once('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.once('exit', (code) => {
    process.exitCode = code ?? 1;
  });
  process.once('SIGINT', () => {
    child.kill('SIGINT');
  });
  process.once('SIGTERM', () => {
    child.kill('SIGTERM');
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Não foi possível iniciar o Convex.');
  process.exitCode = 1;
}
