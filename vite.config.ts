import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import { pageDocument } from './src/app-routes.ts';
import { validateProductionBuild } from './scripts/environment.ts';
import { validatePortalDeploymentUrl } from './config/client-deployment.ts';

const projectRoot = fileURLToPath(new URL('./', import.meta.url));
const webRoot = new URL('./web/', import.meta.url);
export const applicationPages: Plugin = {
  name: 'portal-page-routes',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const url = new URL(request.url ?? '/', 'http://local.invalid');
      const page = pageDocument(url.pathname);
      if (page) request.url = '/' + page + url.search;
      else if (!url.pathname.startsWith('/@') && !/\.[^/]+$/.test(url.pathname)) {
        // Vite otherwise resolves extensionless requests to matching HTML files.
        response.writeHead(404).end();
        return;
      }
      next();
    });
  },
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, '');
  validateProductionBuild({ ...env, ...process.env });
  const deploymentUrl = process.env.VITE_CONVEX_URL || env.VITE_CONVEX_URL;
  validatePortalDeploymentUrl(deploymentUrl, { ...env, ...process.env });
  return {
    appType: 'mpa',
    root: fileURLToPath(webRoot),
    envDir: projectRoot,
    publicDir: false,
    oxc: { jsx: { runtime: 'automatic' } },
    define: { 'import.meta.env.VITE_CONVEX_URL': JSON.stringify(deploymentUrl) },
    plugins: [applicationPages],
    server: {
      host: '127.0.0.1',
      port: Number(process.env.PORT || env.PORT || 4183),
      strictPort: true,
    },
    build: {
      outDir: fileURLToPath(new URL('./dist/app', import.meta.url)),
      emptyOutDir: true,
      manifest: true,
      rolldownOptions: {
        input: Object.fromEntries(
          ['index', 'portal', 'editor', 'logs', 'recover', 'activate'].map((name) => [
            name,
            fileURLToPath(new URL(`${name}.html`, webRoot)),
          ]),
        ),
      },
    },
  };
});
