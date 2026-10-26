import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { createGunzip } from 'node:zlib';
import { extract } from 'tar-fs';
import { chromiumArchives } from './chromium-manifest.ts';
import type { ChromiumRuntime } from './chromium-manifest.ts';

export function safeChromiumTarHeader<T extends { name: string; type: string; mode: number }>(
  header: T,
): T {
  if (
    /^[\\/]|[:\\]/.test(header.name) ||
    header.name.split('/').includes('..') ||
    !['file', 'directory'].includes(header.type)
  )
    throw Error('Entrada insegura no arquivo do runtime PDF.');
  return { ...header, mode: header.mode & 0o777 };
}

export async function extractChromiumTar(source: Readable, destination: string, gzip = false) {
  let invalid: unknown;
  const target = extract(destination, {
    map(header) {
      try {
        return safeChromiumTarHeader(header);
      } catch (error) {
        invalid = error;
        return header;
      }
    },
    ignore: () => !!invalid,
  });
  if (gzip) await pipeline(source, createGunzip(), target);
  else await pipeline(source, target);
  if (invalid) throw invalid;
}

const installations = new Map<string, Promise<{ executablePath: string; directory: string }>>();

async function install(runtime: ChromiumRuntime, directory: string) {
  const executablePath = join(directory, 'chromium');
  try {
    if ((await readFile(join(directory, 'ready'), 'utf8')) === runtime.arch)
      return { executablePath, directory };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const staging = `${directory}.installing`;
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  try {
    for (const name of chromiumArchives) {
      const archive = runtime.archives.find((item) => item.name === name);
      if (!archive) throw Error(`Recurso do Chromium ausente: ${name}.`);
      const response = await fetch(archive.url, {
        headers: { 'Accept-Encoding': 'gzip, deflate' },
      });
      if (!response.ok || !response.body)
        throw Error(`Não foi possível obter o recurso ${name} do PDF.`);
      const compressed = join(staging, `${name}.gz`);
      await pipeline(
        Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>),
        createWriteStream(compressed),
      );
      const bytes = await readFile(compressed);
      if (
        bytes.length !== archive.size ||
        createHash('sha256').update(bytes).digest('hex') !== archive.sha256
      )
        throw Error(`Integridade do recurso ${name} do PDF inválida.`);
      const source = createReadStream(compressed);
      if (name === 'chromium')
        await pipeline(source, createGunzip(), createWriteStream(join(staging, 'chromium')));
      else {
        const destination = name === 'swiftshader' ? staging : join(staging, name);
        await mkdir(destination, { recursive: true });
        await extractChromiumTar(source, destination, true);
      }
      await rm(compressed);
    }
    const executable = await open(join(staging, 'chromium'), 'r');
    const header = Buffer.alloc(20);
    try {
      await executable.read(header, 0, header.length, 0);
    } finally {
      await executable.close();
    }
    const machine = runtime.arch === 'arm64' ? 183 : 62;
    if (
      !header.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) ||
      header[4] !== 2 ||
      header[5] !== 1 ||
      header.readUInt16LE(18) !== machine
    )
      throw Error('O executável PDF não corresponde à arquitetura do runtime.');
    await chmod(join(staging, 'chromium'), 0o700);
    // Vendor fontconfig contains absolute Lambda paths. Bind it to this verified installation.
    await writeFile(
      join(staging, 'fonts', 'fonts.conf'),
      `<?xml version="1.0"?><fontconfig><dir>${join(directory, 'fonts', 'fonts')}</dir><cachedir>${join(directory, 'font-cache')}</cachedir></fontconfig>`,
    );
    await writeFile(join(staging, 'ready'), runtime.arch);
    await rm(directory, { recursive: true, force: true });
    await rename(staging, directory);
    return { executablePath, directory };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

export function prepareChromium(runtime: ChromiumRuntime) {
  if (runtime.arch !== process.arch) throw Error('Arquitetura PDF incompatível com o processo.');
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(runtime.archives.map(({ name, sha256 }) => ({ name, sha256 }))))
    .digest('hex')
    .slice(0, 16);
  const directory = join(
    tmpdir(),
    `dentec-chromium-${runtime.version}-${runtime.arch}-${fingerprint}`,
  );
  let pending = installations.get(directory);
  if (!pending) {
    pending = install(runtime, directory).catch((error) => {
      installations.delete(directory);
      throw error;
    });
    installations.set(directory, pending);
  }
  return pending;
}
