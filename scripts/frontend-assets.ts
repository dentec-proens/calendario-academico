import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';

const historyPath = '/asset-history.json';
const assetPath = /^\/assets\/[\w.-]+\.(?:js|mjs|css|woff2?|ttf|png|svg|ico|webp|jpe?g|wasm)$/;
const maxFile = 16 * 1024 * 1024;
const maxTotal = 256 * 1024 * 1024;
type Asset = { path: string; sha256: string; size: number };
type History = { schemaVersion: 1; assets: Asset[] };
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function parseHistory(value: unknown): History {
  if (
    !value ||
    typeof value !== 'object' ||
    !('schemaVersion' in value) ||
    value.schemaVersion !== 1 ||
    !('assets' in value) ||
    !Array.isArray(value.assets) ||
    !value.assets.length ||
    value.assets.length > 10_000
  )
    throw Error('Inventário de arquivos do frontend inválido.');
  const paths = new Set<string>();
  let size = 0;
  for (const asset of value.assets as unknown[]) {
    if (
      !asset ||
      typeof asset !== 'object' ||
      !('path' in asset) ||
      typeof asset.path !== 'string' ||
      !assetPath.test(asset.path) ||
      paths.has(asset.path) ||
      !('sha256' in asset) ||
      typeof asset.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(asset.sha256) ||
      !('size' in asset) ||
      typeof asset.size !== 'number' ||
      !Number.isSafeInteger(asset.size) ||
      asset.size <= 0 ||
      asset.size > maxFile
    )
      throw Error('Arquivo inválido no inventário do frontend.');
    paths.add(asset.path);
    size += asset.size;
  }
  if (size > maxTotal) throw Error('O histórico do frontend excedeu o limite de retenção.');
  return value as History;
}

async function limitedBytes(response: Response, limit: number) {
  if (!response.body) throw Error('Resposta vazia ao preservar o frontend.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw Error('Resposta excessiva ao preservar o frontend.');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Only public build assets are inherited; HTML, version discovery and user data never are. */
export async function retainFrontendAssets(
  directory: string,
  previous?: { origin: string; fetcher?: typeof fetch },
) {
  const assets = new Map<string, Buffer>();
  for (const filename of await readdir(join(directory, 'assets'))) {
    const path = '/assets/' + filename;
    if (!assetPath.test(path)) throw Error(`Arquivo de build sem contrato de retenção: ${path}`);
    assets.set(path, await readFile(join(directory, path.slice(1))));
  }
  const fetcher = previous?.fetcher ?? fetch;
  const origin = previous ? new URL(previous.origin).origin : '';
  async function request(path: string) {
    return fetcher(origin + path, {
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
  }
  async function download(path: string) {
    const response = await request(path);
    if (!response.ok) throw Error(`Não foi possível preservar ${path} (${response.status}).`);
    return limitedBytes(response, maxFile);
  }
  let inherited: Asset[] = [];
  if (previous) {
    const response = await request(historyPath);
    if (response.status === 404) {
      // One-time adoption of the existing Vite deployment, which predates the inventory.
      // Vite's preload table contains every lazy dependency, including CSS and PDF workers.
      const html = (await download('/')).toString();
      if (html.includes('name="portal-asset-history"'))
        throw Error('O inventário de uma versão com retenção desapareceu. Publicação bloqueada.');
      if (!html.includes('id="root"') || !html.includes('/assets/'))
        throw Error('O frontend anterior não é uma entrada Vite reconhecida.');
      const pending = references(html);
      const seen = new Set<string>();
      let total = 0;
      while (pending.length) {
        const path = pending.shift()!;
        if (seen.has(path)) continue;
        seen.add(path);
        const bytes = await download(path);
        total += bytes.length;
        if (total > maxTotal || seen.size > 10_000) throw Error('Frontend anterior excessivo.');
        inherited.push({ path, size: bytes.length, sha256: digest(bytes) });
        await preserve(path, bytes);
        if (/\.(?:js|mjs|css)$/.test(path)) pending.push(...references(bytes.toString()));
      }
      if (!inherited.length) throw Error('O frontend anterior não contém arquivos preserváveis.');
    } else {
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json'))
        throw Error(`Inventário do frontend anterior indisponível (${response.status}).`);
      inherited = parseHistory(
        JSON.parse((await limitedBytes(response, 4 * 1024 * 1024)).toString()),
      ).assets;
      for (const asset of inherited) {
        const bytes = assets.get(asset.path) ?? (await download(asset.path));
        if (bytes.length !== asset.size || digest(bytes) !== asset.sha256)
          throw Error(`Integridade divergente ao preservar ${asset.path}.`);
        await preserve(asset.path, bytes);
      }
    }
  }
  async function preserve(path: string, bytes: Buffer) {
    const existing = assets.get(path);
    if (existing && !existing.equals(bytes))
      throw Error(`Colisão entre arquivos de versões diferentes: ${path}.`);
    if (!existing) await writeFile(join(directory, path.slice(1)), bytes);
    assets.set(path, bytes);
  }
  const history: History = {
    schemaVersion: 1,
    assets: [...assets]
      .map(([path, bytes]) => ({ path, size: bytes.length, sha256: digest(bytes) }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  };
  parseHistory(history);
  await writeFile(join(directory, historyPath.slice(1)), JSON.stringify(history));
}

function references(source: string): string[] {
  return [
    ...source.matchAll(
      /["'`(]((?:\/?assets\/|\.\/)[\w.-]+-[\w-]{8}\.(?:js|mjs|css|woff2?|ttf|png|svg|ico|webp|jpe?g|wasm))(?=["'`)])/g,
    ),
  ].map((match) => '/assets/' + match[1]!.replace(/^(?:\/?assets\/|\.\/)/, ''));
}

export function frontendAssets(previousOrigin?: string): Plugin {
  let directory: string;
  return {
    name: 'portal-frontend-assets',
    apply: 'build',
    transformIndexHtml() {
      return [
        { tag: 'meta', attrs: { name: 'portal-asset-history', content: '1' }, injectTo: 'head' },
      ];
    },
    configResolved(config) {
      directory = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      await retainFrontendAssets(
        directory,
        previousOrigin ? { origin: previousOrigin } : undefined,
      );
    },
  };
}
