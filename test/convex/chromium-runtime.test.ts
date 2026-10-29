import { afterEach, expect, test, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { pack } from 'tar-fs';
import { convexTest } from 'convex-test';
import { extractChromiumTar, prepareChromium } from '../../src/runtime/pdf/chromium-runtime.ts';
import {
  chromiumArchives,
  chromiumVersion,
  parseChromiumManifest,
} from '../../src/runtime/pdf/chromium-manifest.ts';
import type { ChromiumManifest, ChromiumRuntime } from '../../src/runtime/pdf/chromium-manifest.ts';
import { internal } from '../../convex/_generated/api';
import schema from '../../convex/schema';
import { convexModules } from '../helpers/convex-modules';

afterEach(() => vi.unstubAllEnvs());

test('PDF archive extraction rejects traversal, absolute paths and links before writing entries', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dentec-runtime-security-'));
  try {
    const source = join(directory, 'source');
    const destination = join(directory, 'destination');
    await import('node:fs/promises').then(({ mkdir }) =>
      Promise.all([mkdir(source), mkdir(destination)]),
    );
    await writeFile(join(source, 'input'), 'untrusted archive content');
    for (const unsafe of [
      '../escape',
      '/absolute',
      'C:\\escape',
      'nested/../../escape',
      'nested\\escape',
    ]) {
      await expect(
        extractChromiumTar(
          pack(source, { map: (header) => ({ ...header, name: unsafe }) }),
          destination,
        ),
      ).rejects.toThrow('Entrada insegura');
    }
    await expect(
      extractChromiumTar(
        pack(source, { map: (header) => ({ ...header, type: 'symlink', linkname: '../escape' }) }),
        destination,
      ),
    ).rejects.toThrow('Entrada insegura');
    await expect(readFile(join(directory, 'escape'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(join(destination, 'input'))).rejects.toMatchObject({ code: 'ENOENT' });
    await extractChromiumTar(pack(source), destination);
    expect(await readFile(join(destination, 'input'), 'utf8')).toBe('untrusted archive content');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('PDF runtime rejects a mismatched gzip digest and retries a failed installation', async () => {
  const arch = process.arch;
  if (arch !== 'x64' && arch !== 'arm64') throw Error('Unsupported test architecture');
  const bytes = gzipSync('not executable');
  const runtime: ChromiumRuntime = {
    version: chromiumVersion,
    arch,
    archives: chromiumArchives.map((name) => ({
      name,
      url: `data:application/gzip;base64,${bytes.toString('base64')}`,
      sha256: 'b'.repeat(64),
      size: bytes.length,
    })),
  };
  for (let attempt = 0; attempt < 2; attempt++)
    await expect(prepareChromium(runtime)).rejects.toThrow('Integridade do recurso chromium');
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(runtime.archives.map(({ name, sha256 }) => ({ name, sha256 }))))
    .digest('hex')
    .slice(0, 16);
  await expect(
    readFile(join(tmpdir(), `dentec-chromium-${chromiumVersion}-${arch}-${fingerprint}`, 'ready')),
  ).rejects.toMatchObject({ code: 'ENOENT' });
});

test('operational runtime requires both architectures and Storage size/digest confirmation', async () => {
  const client = convexTest(schema, convexModules);
  await expect(client.query(internal.runtimeArtifacts.status, {})).rejects.toThrow(
    'Runtime PDF ausente',
  );
  const bytes = new TextEncoder().encode('synthetic gzip resource');
  const storageId = await client.run((ctx) => ctx.storage.store(new Blob([bytes])));
  const archive = {
    storageId,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    size: bytes.length,
  };
  const manifest: ChromiumManifest = {
    version: chromiumVersion,
    architectures: {
      x64: { chromium: archive, fonts: archive, swiftshader: archive, al2023: archive },
      arm64: { chromium: archive, fonts: archive, swiftshader: archive, al2023: archive },
    },
  };
  vi.stubEnv('DENTEC_CHROMIUM_RUNTIME', JSON.stringify(manifest));
  expect(await client.query(internal.runtimeArtifacts.status, {})).toEqual({
    version: chromiumVersion,
    ready: true,
  });
  manifest.architectures.arm64.chromium = { ...archive, sha256: 'a'.repeat(64) };
  vi.stubEnv('DENTEC_CHROMIUM_RUNTIME', JSON.stringify(manifest));
  expect(await client.query(internal.runtimeArtifacts.status, {})).toEqual({
    version: chromiumVersion,
    ready: false,
  });
  expect(() =>
    parseChromiumManifest(
      JSON.stringify({
        version: chromiumVersion,
        architectures: { x64: manifest.architectures.x64 },
      }),
    ),
  ).toThrow('Runtime PDF ausente');
});
