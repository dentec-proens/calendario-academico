import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';

const aliases = new Map([
  ['/', 'portal.html'],
  ['/portal', 'portal.html'],
  ['/editor', 'index.html'],
  ['/logs', 'logs.html'],
  ['/recuperar-senha', 'recover.html'],
  ['/ativar', 'activate.html'],
  ['/ativar-conta', 'activate.html'],
]);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// This server only serves the built React portal. Authentication, data, files,
// PDF generation and all mutations go directly to Convex.
export function nativeStatic(directory = resolve('dist/native')) {
  const root = resolve(directory);
  return async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://local.invalid').pathname);
      if (!['GET', 'HEAD'].includes(req.method) || path.startsWith('/api/')) {
        res.writeHead(404);
        res.end();
        return;
      }
      const relative = aliases.get(path) || path.replace(/^\//, '');
      const file = resolve(root, relative);
      if (!file.startsWith(root + sep) || !mime[extname(file)]) {
        res.writeHead(404);
        res.end();
        return;
      }
      const bytes = await readFile(file);
      res.writeHead(200, {
        'Content-Type': mime[extname(file)],
        'Cache-Control': extname(file) === '.html' ? 'no-store' : 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'same-origin',
        'X-Frame-Options': 'DENY',
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://*.convex.site; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch {
      res.writeHead(404);
      res.end();
    }
  };
}
