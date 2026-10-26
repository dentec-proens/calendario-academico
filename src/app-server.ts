import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import type { RequestListener } from 'node:http';
import { pageDocument } from './app-routes.ts';

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// Local preview serves assets only. Convex owns auth, data, files and APIs.
export function staticPortal(directory = resolve('dist/app')): RequestListener {
  const root = resolve(directory);
  const serve: (
    request: Parameters<RequestListener>[0],
    response: Parameters<RequestListener>[1],
  ) => Promise<void> = async (request, response) => {
    try {
      const path = new URL(request.url ?? '/', 'http://local.invalid').pathname;
      if (!['GET', 'HEAD'].includes(request.method ?? '') || path.startsWith('/api/')) {
        response.writeHead(404).end();
        return;
      }
      if (path.endsWith('.html')) {
        response.writeHead(404).end();
        return;
      }
      const file = resolve(root, pageDocument(path) ?? decodeURIComponent(path).replace(/^\//, ''));
      const contentType = contentTypes[extname(file)];
      if (
        !file.startsWith(root + sep) ||
        !contentType ||
        (extname(file) === '.html' && !pageDocument(path))
      ) {
        response.writeHead(404).end();
        return;
      }
      const bytes = await readFile(file);
      response.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': extname(file) === '.html' ? 'no-store' : 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'same-origin',
        'X-Frame-Options': 'DENY',
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://*.convex.site; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch {
      response.writeHead(404).end();
    }
  };
  return (request, response) => {
    void serve(request, response);
  };
}
