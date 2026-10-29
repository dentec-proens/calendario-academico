import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  chromiumArchives,
  chromiumVersion,
  parseChromiumManifest,
} from '../src/runtime/pdf/chromium-manifest.ts';
import type { ChromiumManifest } from '../src/runtime/pdf/chromium-manifest.ts';
import { prepareChromiumResources } from './chromium-resources.ts';
import { environments } from '../config/environments.ts';
import { assertNoTargetOverrides, convexCli, root, readDevEnvironment } from './environment.ts';

export async function preparePdfRuntime(environment: NodeJS.ProcessEnv, target: string[]) {
  async function cli(args: string[], input?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [convexCli, ...args, ...target], {
        cwd: root,
        env: environment,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let output = '';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        output += chunk;
      });
      child.stderr.resume();
      child.stdin.on('error', () => {});
      child.stdin.end(input);
      child.once('error', reject);
      child.once('close', (code) =>
        code === 0
          ? resolve(output.trim())
          : reject(Error(`Preparação do runtime PDF falhou em Convex ${args[0]}.`)),
      );
    });
  }
  try {
    const value = await cli(['env', 'get', 'DENTEC_CHROMIUM_RUNTIME']);
    parseChromiumManifest(value);
    const status: { ready: boolean } = JSON.parse(
      await cli(['run', 'runtimeArtifacts:status', '{}', '--codegen', 'disable']),
    );
    if (status.ready) {
      console.log(`Runtime PDF ${chromiumVersion} já está preparado.`);
      return;
    }
  } catch {
    /* A missing or obsolete manifest requires publishing new operational resources. */
  }
  const manifest: ChromiumManifest = {
    version: chromiumVersion,
    architectures: {
      x64: {} as ChromiumManifest['architectures']['x64'],
      arm64: {} as ChromiumManifest['architectures']['arm64'],
    },
  };
  for (const arch of ['x64', 'arm64'] as const) {
    console.log(`Preparando recursos gzip do Chromium ${chromiumVersion} (${arch}).`);
    const resources = await prepareChromiumResources(arch);
    for (const name of chromiumArchives) {
      const resource = resources[name];
      const url: string = JSON.parse(
        await cli(['run', 'runtimeArtifacts:uploadUrl', '{}', '--codegen', 'disable']),
      );
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/gzip' },
        body: await readFile(resource.path),
      });
      if (!response.ok) throw Error(`Upload do recurso ${arch}/${name} falhou.`);
      const result = (await response.json()) as { storageId: string };
      if (!result.storageId) throw Error('O Storage não confirmou o recurso PDF.');
      manifest.architectures[arch][name] = {
        storageId: result.storageId,
        sha256: resource.sha256,
        size: resource.size,
      };
    }
  }
  await cli(['env', 'set'], `DENTEC_CHROMIUM_RUNTIME='${JSON.stringify(manifest)}'\n`);
  const status: { ready: boolean } = JSON.parse(
    await cli(['run', 'runtimeArtifacts:status', '{}', '--codegen', 'disable']),
  );
  if (!status.ready)
    throw Error('Recursos PDF publicados, mas o deployment não confirmou integridade.');
  console.log(`Runtime PDF ${chromiumVersion} preparado e verificado nas duas arquiteturas.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (!args.length) {
    const selected = readDevEnvironment();
    await preparePdfRuntime({ ...process.env, ...selected }, [
      '--env-file',
      '.env.local',
      '--deployment',
      selected.CONVEX_DEPLOYMENT.slice(4),
    ]);
  } else {
    assertNoTargetOverrides(process.env);
    if (
      args.length !== 3 ||
      args[0] !== '--production' ||
      args[1] !== '--env-file' ||
      process.env.CONVEX_DEPLOYMENT !== `prod:${environments.production.deployment}` ||
      (await readFile(args[2]!, 'utf8')).trim() !==
        `CONVEX_DEPLOYMENT=prod:${environments.production.deployment}`
    )
      throw Error(
        'Preparação de produção exige o destino explícito e conferido do script de publicação.',
      );
    await preparePdfRuntime(process.env, ['--env-file', args[2]!]);
  }
}
