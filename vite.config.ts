import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import { pageRoutes } from './src/app-routes.ts';
import { validateProductionBuild } from './scripts/environment.ts';
import { validatePortalDeploymentUrl } from './config/client-deployment.ts';

const projectRoot = fileURLToPath(new URL('./', import.meta.url));
const webRoot = new URL('./web/', import.meta.url);
const domainModules = [
  'teacher-day',
  'duration',
  'history-dates',
  'history-progress',
  'stage-suggestions',
  'teacher-vacations',
  'calendar-label',
  'evaluation',
  'modalities',
  'obligations',
  'categories',
  'calendar',
  'saturdays',
];
const pageAliases: Plugin = {
  name: 'portal-page-routes',
  configureServer(server) {
    server.middlewares.use((request, _response, next) => {
      const url = new URL(request.url ?? '/', 'http://local.invalid');
      const page = pageRoutes.get(url.pathname);
      if (page) request.url = '/' + page + url.search;
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
    root: fileURLToPath(webRoot),
    envDir: projectRoot,
    publicDir: false,
    oxc: { jsx: { runtime: 'automatic' } },
    define: { 'import.meta.env.VITE_CONVEX_URL': JSON.stringify(deploymentUrl) },
    resolve: {
      alias: Object.fromEntries(
        domainModules.map((name) => [
          `/${name}.mjs`,
          fileURLToPath(
            new URL(
              `./src/${name}.${['calendar', 'history-dates'].includes(name) ? 'ts' : 'mjs'}`,
              import.meta.url,
            ),
          ),
        ]),
      ),
    },
    plugins: [pageAliases],
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
