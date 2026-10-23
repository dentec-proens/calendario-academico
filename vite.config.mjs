import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const native = process.env.DENTEC_CONVEX_NATIVE === '1' || process.env.VITE_CONVEX_NATIVE === '1';
const root = new URL('./web/', import.meta.url);
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

export default defineConfig({
  root: fileURLToPath(new URL('./web', import.meta.url)),
  publicDir: false,
  oxc: { jsx: { runtime: 'automatic' } },
  define: native
    ? {
        'import.meta.env.VITE_CONVEX_NATIVE': JSON.stringify('1'),
        'import.meta.env.VITE_CONVEX_URL': JSON.stringify(
          process.env.CONVEX_URL || process.env.VITE_CONVEX_URL,
        ),
      }
    : {},
  resolve: {
    alias: Object.fromEntries(
      domainModules.map((name) => [
        `/${name}.mjs`,
        fileURLToPath(new URL(`./src/${name}.mjs`, import.meta.url)),
      ]),
    ),
  },
  plugins: native
    ? [
        {
          name: 'native-auth-pages',
          transformIndexHtml: {
            order: 'pre',
            handler: (html) =>
              html.replace(
                /src="\/(app|logs|recover|activate)\.js"/g,
                (_, page) => `src="/native/${page === 'app' ? 'editor' : page}.jsx"`,
              ),
          },
        },
      ]
    : [],
  build: {
    outDir: fileURLToPath(new URL(native ? './dist/native' : './dist/portal', import.meta.url)),
    emptyOutDir: true,
    manifest: true,
    rolldownOptions: {
      input: native
        ? Object.fromEntries(
            ['portal', 'index', 'logs', 'recover', 'activate'].map((name) => [
              name,
              fileURLToPath(new URL(`${name}.html`, root)),
            ]),
          )
        : fileURLToPath(new URL('./web/portal.html', import.meta.url)),
    },
  },
});
