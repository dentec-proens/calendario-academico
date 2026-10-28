import { expect, test } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../src/domain');
async function sources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) =>
        entry.isDirectory() ? sources(join(directory, entry.name)) : [join(directory, entry.name)],
      ),
    )
  )
    .flat()
    .filter((file) => file.endsWith('.ts'));
}

function importsIn(text: string) {
  const imports: { specifier: string; typeOnly: boolean }[] = [];
  for (const match of text.matchAll(
    /\b(import|export)\s+(type\s+)?([^;]*?)\s+from\s+['"]([^'"]+)['"]/g,
  )) {
    const [, , typeOnly, bindings, specifier] = match;
    imports.push({
      specifier,
      typeOnly:
        Boolean(typeOnly) ||
        /^\{\s*type\s+[^,}]+(?:,\s*type\s+[^,}]+)*\s*\}$/.test(bindings.trim()),
    });
  }
  for (const match of text.matchAll(/\bimport\s*(?:\(\s*)?(['"])([^'"]+)\1/g))
    imports.push({ specifier: match[2], typeOnly: false });
  return imports;
}

function hasComputedImport(text: string) {
  return [...text.matchAll(/\bimport\s*\(([^)]*)\)/g)].some(
    (match) => !/^\s*(['"])[^'"]+\1\s*$/.test(match[1]),
  );
}

test('dependency discovery includes type imports, side effects and literal dynamic imports', () => {
  expect(
    importsIn(`import type { A } from './a.ts';
    import { type B, type C } from './b.ts';
    import { type D, run } from './d.ts';
    import './side-effect.ts';
    const runtime = import('./dynamic.ts');`),
  ).toEqual([
    { specifier: './a.ts', typeOnly: true },
    { specifier: './b.ts', typeOnly: true },
    { specifier: './d.ts', typeOnly: false },
    { specifier: './side-effect.ts', typeOnly: false },
    { specifier: './dynamic.ts', typeOnly: false },
  ]);
});

test('calculated imports cannot hide their dependency behind a literal prefix', () => {
  expect(hasComputedImport("import('./fixed.ts')")).toBe(false);
  expect(hasComputedImport("import('./' + name)")).toBe(true);
  expect(hasComputedImport('import(moduleUrl)')).toBe(true);
  expect(hasComputedImport('import(`./${name}.ts`)')).toBe(true);
});

test('academic domain stays independent of framework/runtime adapters and has no runtime import cycles', async () => {
  const shared = [resolve(root, '../equal.ts')];
  const files = [...(await sources(root)), ...shared];
  const graph = new Map<string, string[]>();
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    const label = relative(root, file);
    // A computed module URL would evade inspection and is unnecessary in the pure domain.
    expect(hasComputedImport(text), label).toBe(false);
    const edges: string[] = [];
    for (const { specifier, typeOnly } of importsIn(text)) {
      if (!specifier.startsWith('.')) {
        expect(specifier, label).toMatch(/^@noble\/hashes\//);
        continue;
      }
      const target = resolve(dirname(file), specifier).replace(/\.js$/, '.ts');
      const withinDomain = !relative(root, target).startsWith('..');
      expect(withinDomain || shared.includes(target), `${label} imports ${specifier}`).toBe(true);
      if (!typeOnly) edges.push(target);
    }
    graph.set(file, edges);
  }
  const visited = new Set<string>();
  function visit(file: string, ancestors: string[]) {
    expect(
      ancestors,
      `Runtime import cycle: ${[...ancestors, file].map((item) => relative(root, item)).join(' → ')}`,
    ).not.toContain(file);
    if (visited.has(file)) return;
    for (const target of graph.get(file) ?? []) visit(target, [...ancestors, file]);
    visited.add(file);
  }
  for (const file of files) visit(file, []);
});
