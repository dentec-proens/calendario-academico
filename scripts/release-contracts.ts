import { createHash } from 'node:crypto';
import type { ReleasePlan } from '../convex/releases/plan.ts';
import { assertPlan } from '../convex/releases/plan.ts';

type Validator = { type: string; value?: unknown; [key: string]: unknown };
type Field = { optional: boolean; fieldType: Validator };
type Table = {
  tableName: string;
  documentType: Validator;
  indexes: unknown[];
  searchIndexes: unknown[];
  vectorIndexes: unknown[];
  [key: string]: unknown;
};
export type Contracts = {
  schema: { schemaValidation: boolean; tables: Table[] };
  functions: Record<
    string,
    { kind: string; visibility: string; args: Validator | null; returns: Validator | null }
  >;
};
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export const fingerprint = (value: unknown) =>
  createHash('sha256').update(canonical(value)).digest('hex');
function includes(old: Validator, next: Validator): boolean {
  if (canonical(old) === canonical(next) || next.type === 'any') return true;
  if (old.type === 'union') return (old.value as Validator[]).every((item) => includes(item, next));
  if (next.type === 'union') return (next.value as Validator[]).some((item) => includes(old, item));
  if (old.type === 'object' && next.type === 'object') {
    const before = old.value as Record<string, Field>,
      after = next.value as Record<string, Field>;
    return (
      Object.entries(before).every(
        ([name, field]) =>
          Object.hasOwn(after, name) &&
          after[name] &&
          (!field.optional || after[name]!.optional) &&
          includes(field.fieldType, after[name]!.fieldType),
      ) &&
      Object.entries(after).every(([name, field]) => Object.hasOwn(before, name) || field.optional)
    );
  }
  if (old.type === 'array' && next.type === 'array')
    return includes(old.value as Validator, next.value as Validator);
  return false;
}
function requireCompatible(ok: unknown, description: string): asserts ok {
  if (!ok) throw Error(`Expansão incompatível: ${description}.`);
}
export function assertExpansion(before: Contracts, after: Contracts, plan: ReleasePlan) {
  assertPlan(plan);
  requireCompatible(
    before.schema.schemaValidation && after.schema.schemaValidation,
    'schemaValidation precisa permanecer ativo',
  );
  for (const table of before.schema.tables) {
    const next = after.schema.tables.find((item) => item.tableName === table.tableName);
    requireCompatible(next, `tabela removida ${table.tableName}`);
    requireCompatible(
      includes(table.documentType, next.documentType),
      `dados antigos de ${table.tableName}`,
    );
    if (
      /^auth/.test(table.tableName) ||
      ['users', 'invitations', 'passwordResets'].includes(table.tableName)
    )
      requireCompatible(
        canonical(table) === canonical(next),
        `tabela de autenticação ${table.tableName}`,
      );
    for (const kind of ['indexes', 'searchIndexes', 'vectorIndexes'] as const)
      for (const index of table[kind])
        requireCompatible(
          next[kind].some((item) => canonical(item) === canonical(index)),
          `índice de ${table.tableName}`,
        );
    for (const kind of [
      'stagedDocumentType',
      'stagedDbIndexes',
      'stagedSearchIndexes',
      'stagedVectorIndexes',
    ])
      requireCompatible(
        canonical(table[kind]) === canonical(next[kind]),
        `validação/índice staged de ${table.tableName}`,
      );
  }
  for (const [name, fn] of Object.entries(before.functions)) {
    const next = after.functions[name];
    requireCompatible(next, `função removida ${name}`);
    requireCompatible(
      next.kind === fn.kind && next.visibility === fn.visibility,
      `tipo/visibilidade de ${name}`,
    );
    requireCompatible(
      fn.args === null ? next.args === null : next.args !== null && includes(fn.args, next.args),
      `argumentos de ${name}`,
    );
    requireCompatible(canonical(fn.returns) === canonical(next.returns), `retorno de ${name}`);
  }
  for (const item of plan.migrations) {
    const old = before.schema.tables.find((table) => table.tableName === item.table)?.documentType;
    const next = after.schema.tables.find((table) => table.tableName === item.table)?.documentType;
    requireCompatible(
      next?.type === 'object' && (!old || old.type === 'object'),
      `schema da migração ${item.id}`,
    );
    const field = (next.value as Record<string, Field>)[item.field];
    requireCompatible(
      field?.optional && (!old || !(item.field in (old.value as Record<string, Field>))),
      `a migração ${item.id} deve preencher somente campo novo e opcional`,
    );
  }
}

export function assertRemoteFunctions(raw: unknown, expected: Contracts, url: string) {
  const value = raw as {
    url?: unknown;
    functions?: Array<{
      functionType: string;
      path?: string;
      method?: string;
      identifier: string;
      visibility: { kind: string };
      args: Validator | null;
      returns: Validator | null;
    }>;
  };
  requireCompatible(
    value?.url === url && Array.isArray(value.functions),
    'metadados remotos ou destino inválidos',
  );
  const functions: Contracts['functions'] = {};
  for (const fn of value.functions) {
    if (fn.functionType === 'HttpAction') {
      requireCompatible(
        typeof fn.path === 'string' && typeof fn.method === 'string',
        'rota HTTP inválida',
      );
      functions[`HTTP:${fn.method}:${fn.path}`] = {
        kind: 'http',
        visibility: 'public',
        args: null,
        returns: null,
      };
      continue;
    }
    requireCompatible(
      ['Query', 'Mutation', 'Action'].includes(fn.functionType) &&
        typeof fn.identifier === 'string' &&
        ['public', 'internal'].includes(fn.visibility?.kind),
      'função remota desconhecida',
    );
    functions[fn.identifier] = {
      kind: fn.functionType.toLowerCase(),
      visibility: fn.visibility.kind,
      args: fn.args,
      returns: fn.returns,
    };
  }
  requireCompatible(
    canonical(functions) === canonical(expected.functions),
    'contratos do backend remoto divergem da revisão registrada',
  );
}
