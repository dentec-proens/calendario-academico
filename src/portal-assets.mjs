import { readFile } from 'node:fs/promises';

const types = {
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
};
export const portalBuildDirectory = new URL('../dist/portal/', import.meta.url);

// Only generated assets are public; the build manifest and source tree stay private.
export async function portalAsset(path, directory = portalBuildDirectory) {
  const html = path === '/';
  const match = path.match(/^\/assets\/([\w.-]+\.([a-z0-9]+))$/);
  if (!html && (!match || !Object.hasOwn(types, match[2]))) return null;
  try {
    const content = await readFile(new URL(html ? 'portal.html' : 'assets/' + match[1], directory));
    return { content, type: html ? 'text/html; charset=utf-8' : types[match[2]] };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (!html) return null;
    throw Object.assign(
      Error(
        'Portal não compilado. Execute pnpm run build antes de pnpm start, ou use pnpm run dev.',
      ),
      { status: 503 },
    );
  }
}
