import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { createBrotliDecompress, createGzip } from 'node:zlib';
import { chromiumArchives, chromiumVersion } from '../src/printing/chromium-manifest.ts';
import type { ChromiumArchiveName } from '../src/printing/chromium-manifest.ts';
import { extractChromiumTar } from '../src/printing/chromium-runtime.ts';
import { root } from './environment.ts';

const armPackHash = 'b6874fc0d7af15e16a15ef1b73177731f698c296c73d26aa4a90840c0777a338';
export type LocalChromiumResources = Record<
  ChromiumArchiveName,
  { path: string; sha256: string; size: number }
>;

export async function prepareChromiumResources(
  arch: 'x64' | 'arm64',
): Promise<LocalChromiumResources> {
  const cache = join(root, '.temp', 'chromium', chromiumVersion, arch);
  await mkdir(cache, { recursive: true });
  let source = join(
    dirname(fileURLToPath(import.meta.resolve('@sparticuz/chromium'))),
    '..',
    'bin',
  );
  if (arch === 'arm64') {
    source = join(cache, 'vendor');
    try {
      if ((await readFile(join(source, 'verified'), 'utf8')) !== armPackHash)
        throw Error('Cache vendor incompleto.');
    } catch {
      const pack = join(cache, 'vendor.tar');
      const response = await fetch(
        `https://github.com/Sparticuz/chromium/releases/download/v${chromiumVersion}/chromium-v${chromiumVersion}-pack.arm64.tar`,
        { headers: { 'Accept-Encoding': 'gzip, deflate' } },
      );
      if (!response.ok || !response.body)
        throw Error('Não foi possível obter o pacote oficial ARM64 do Chromium.');
      await pipeline(
        Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>),
        createWriteStream(pack),
      );
      if (
        createHash('sha256')
          .update(await readFile(pack))
          .digest('hex') !== armPackHash
      )
        throw Error('Digest do pacote oficial ARM64 do Chromium não confere.');
      await rm(source, { recursive: true, force: true });
      await mkdir(source, { recursive: true });
      await extractChromiumTar(createReadStream(pack), source);
      await writeFile(join(source, 'verified'), armPackHash);
      await rm(pack);
    }
  }
  const resources = {} as LocalChromiumResources;
  for (const name of chromiumArchives) {
    const filename = name === 'chromium' ? 'chromium' : `${name}.tar`;
    const path = join(cache, `${filename}.gz`);
    try {
      await readFile(path);
    } catch {
      try {
        // Conversion runs on the developer/build host, never inside Convex actions.
        await pipeline(
          createReadStream(join(source, `${filename}.br`)),
          createBrotliDecompress(),
          createGzip({ level: 6 }),
          createWriteStream(`${path}.partial`),
        );
        await rename(`${path}.partial`, path);
      } catch (error) {
        await rm(`${path}.partial`, { force: true });
        throw error;
      }
    }
    const bytes = await readFile(path);
    resources[name] = {
      path,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      size: bytes.length,
    };
  }
  return resources;
}
