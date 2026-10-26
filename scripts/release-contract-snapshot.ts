import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Contracts } from './release-contracts.ts';

const root = process.argv[2];
if (!root) throw Error('Informe a raiz para inspecionar contratos locais.');
const functions: Contracts['functions'] = {};
async function visit(directory: string) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (
      entry.name.startsWith('_') ||
      entry.name.endsWith('.d.ts') ||
      entry.name.endsWith('.config.ts') ||
      entry.name === 'schema.ts'
    )
      continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await visit(path);
    else if (entry.name.endsWith('.ts')) {
      const module = (await import(pathToFileURL(path).href)) as Record<string, unknown>;
      const router = module.default as
        { getRoutes?: () => Array<[string, string, unknown]> } | undefined;
      if (router?.getRoutes)
        for (const [path, method] of router.getRoutes())
          functions[`HTTP:${method}:${path}`] = {
            kind: 'http',
            visibility: 'public',
            args: null,
            returns: null,
          };
      for (const [name, value] of Object.entries(module)) {
        if (typeof value !== 'function' || !('exportArgs' in value)) continue;
        const fn = value as unknown as {
          exportArgs: () => string;
          exportReturns: () => string;
          isQuery?: boolean;
          isMutation?: boolean;
          isInternal?: boolean;
        };
        functions[
          `${relative(join(root!, 'convex'), path).replaceAll('\\', '/').replace(/\.ts$/, '.js')}:${name}`
        ] = {
          kind: fn.isQuery ? 'query' : fn.isMutation ? 'mutation' : 'action',
          visibility: fn.isInternal ? 'internal' : 'public',
          args: JSON.parse(fn.exportArgs()) as Contracts['functions'][string]['args'],
          returns: JSON.parse(fn.exportReturns()) as Contracts['functions'][string]['returns'],
        };
      }
    }
  }
}
await visit(join(root, 'convex'));
const schema = (await import(pathToFileURL(join(root, 'convex/schema.ts')).href)) as {
  default: { export: () => string };
};
console.log(JSON.stringify({ schema: JSON.parse(schema.default.export()) as unknown, functions }));
