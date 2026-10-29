import { expect, test } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

const repository = resolve(import.meta.dirname, '../..');
const root = resolve(repository, 'src/domain');
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
    .filter((file) => /\.tsx?$/.test(file) && !file.includes('/_generated/'));
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
  const shared = [resolve(root, '../shared/equal.ts')];
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

const policies = resolve(root, 'policies');
const inside = (directory: string, file: string) => !relative(directory, file).startsWith('..');
// Relative specifiers and the package's `#src/*` subpath import, resolved to files.
const relativeTargets = (file: string, text: string) =>
  importsIn(text)
    .filter(({ specifier }) => specifier.startsWith('.') || specifier.startsWith('#src/'))
    .map(({ specifier }) =>
      (specifier.startsWith('#src/')
        ? resolve(repository, 'src', specifier.slice('#src/'.length))
        : resolve(dirname(file), specifier)
      ).replace(/\.js$/, '.ts'),
    )
    // Convex modules import without extensions.
    .map((target) => (/\.(?:m?[jt]sx?|mts)$/.test(target) ? target : `${target}.ts`));

test('year-specific behaviour lives only in the policies selected by the registry', async () => {
  // Equality, ordering, `case`, year lists and ruleset prefixes such as `consup-292-2027-`.
  const yearBranch =
    /(?:[!=]==?|[<>]=?)\s*['"]?20[2-9]\d\b|\b20[2-9]\d['"]?\s*(?:[!=]==?|[<>]=?)|case\s+['"]?20[2-9]\d\b|\[\s*20[2-9]\d\s*,|startsWith\(['"][a-z0-9-]*-20[2-9]\d-/;
  const selector = resolve(policies, 'registry.ts');
  const contract = resolve(policies, 'contract.ts');
  // M7 only: these read-only operations inventory historical years and compare a frozen
  // pre-v4 source with migrated snapshots; they do not select normative product behaviour.
  // The concrete-policy import restriction below still applies to every one of these files.
  const historicalYearInventoryFiles = new Set([
    'convex/legacy.ts',
    'scripts/administration/offers-source-projection.ts',
    'scripts/administration/offers-projection.ts',
    'scripts/administration/offers-verify.ts',
  ]);
  for (const directory of ['src', 'web', 'convex', 'scripts']) {
    for (const file of await sources(resolve(repository, directory))) {
      const label = relative(repository, file);
      const text = await readFile(file, 'utf8');
      if (!inside(policies, file) && !historicalYearInventoryFiles.has(label))
        expect(text, `${label} branches on a calendar year`).not.toMatch(yearBranch);
      for (const target of relativeTargets(file, text)) {
        if (!inside(policies, target) || target === contract || target === selector) continue;
        // Policies compose neutral bases from the domain, never another policy.
        expect(
          file === selector,
          `${label} imports ${relative(repository, target)}; use policyFor()`,
        ).toBe(true);
      }
    }
  }
});

test('domain rule violations use DomainError so adapters can show them', async () => {
  for (const file of await sources(root)) {
    const text = await readFile(file, 'utf8');
    expect(text, relative(repository, file)).not.toMatch(
      /throw\s+(?:new\s+)?Error\(|Object\.assign\(\s*(?:new\s+)?Error\(/,
    );
  }
});

test('printing stays a pure model and browser code never reaches the Node runtime', async () => {
  const runtime = resolve(repository, 'src/runtime');
  const printing = resolve(repository, 'src/printing');
  const pure = [root, printing, resolve(repository, 'src/shared')];
  for (const file of await sources(printing)) {
    const label = relative(repository, file);
    const text = await readFile(file, 'utf8');
    for (const { specifier } of importsIn(text))
      expect(specifier.startsWith('.'), `${label} imports ${specifier}`).toBe(true);
    for (const target of relativeTargets(file, text))
      expect(
        pure.some((directory) => inside(directory, target)),
        `${label} imports ${relative(repository, target)}`,
      ).toBe(true);
  }
  for (const directory of ['web', 'src/app']) {
    for (const file of await sources(resolve(repository, directory))) {
      const label = relative(repository, file);
      const text = await readFile(file, 'utf8');
      for (const { specifier } of importsIn(text))
        expect(specifier, `${label} imports a Node built-in`).not.toMatch(/^node:/);
      for (const target of relativeTargets(file, text))
        expect(inside(runtime, target), `${label} imports ${relative(repository, target)}`).toBe(
          false,
        );
    }
  }
});
