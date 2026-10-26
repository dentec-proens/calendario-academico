import { v } from 'convex/values';
import type { Infer } from 'convex/values';

export const migration = v.object({
  id: v.string(),
  table: v.union(
    v.literal('campuses'),
    v.literal('calendars'),
    v.literal('calendarContents'),
    v.literal('documents'),
    v.literal('institutionalEvents'),
  ),
  field: v.string(),
  source: v.union(
    v.object({
      kind: v.literal('literal'),
      value: v.union(v.null(), v.string(), v.number(), v.boolean()),
    }),
    v.object({ kind: v.literal('copy'), field: v.string() }),
  ),
});
export const planValidator = v.object({
  version: v.literal(1),
  baseline: v.string(),
  strategy: v.literal('expand'),
  guarantees: v.object({
    oldClients: v.literal(true),
    oldWriters: v.literal(true),
    scheduledFunctions: v.literal(true),
    sessions: v.literal(true),
  }),
  rationale: v.string(),
  tests: v.array(v.string()),
  migrations: v.array(migration),
});
export type ReleasePlan = Infer<typeof planValidator>;
export type Migration = Infer<typeof migration>;
export function assertPlan(plan: ReleasePlan) {
  if (
    !plan ||
    plan.version !== 1 ||
    plan.strategy !== 'expand' ||
    typeof plan.baseline !== 'string' ||
    !/^[a-f0-9]{40}$/.test(plan.baseline) ||
    typeof plan.rationale !== 'string' ||
    plan.rationale.trim().length < 40 ||
    !Array.isArray(plan.tests) ||
    !plan.tests.length ||
    !plan.tests.every((value) => typeof value === 'string') ||
    !plan.guarantees ||
    !['oldClients', 'oldWriters', 'scheduledFunctions', 'sessions'].every(
      (key) => Reflect.get(plan.guarantees, key) === true,
    ) ||
    !Array.isArray(plan.migrations)
  )
    throw Error(
      'O plano exige expansão, baseline, justificativa e evidências dos clientes antigos, escritores, jobs e sessões.',
    );
  if (plan.migrations.length > 25 || plan.tests.length > 64 || plan.rationale.length > 4000)
    throw Error('Plano excede os limites operacionais da release.');
  if (
    Object.keys(plan).some(
      (key) =>
        ![
          'version',
          'baseline',
          'strategy',
          'guarantees',
          'rationale',
          'tests',
          'migrations',
        ].includes(key),
    ) ||
    Object.keys(plan.guarantees).length !== 4
  )
    throw Error('O plano contém campos desconhecidos.');
  for (const item of plan.migrations) {
    if (
      !item ||
      typeof item.id !== 'string' ||
      !/^[a-z][a-z0-9-]{2,79}$/.test(item.id) ||
      !['campuses', 'calendars', 'calendarContents', 'documents', 'institutionalEvents'].includes(
        item.table,
      ) ||
      typeof item.field !== 'string' ||
      !/^[a-zA-Z][a-zA-Z0-9]{0,79}$/.test(item.field) ||
      !item.source ||
      !['literal', 'copy'].includes(item.source.kind) ||
      Object.keys(item).some((key) => !['id', 'table', 'field', 'source'].includes(key))
    )
      throw Error('Identidade, tabela ou campo de migração inválido.');
    if (
      item.source.kind === 'copy'
        ? typeof item.source.field !== 'string' ||
          !/^[a-zA-Z][a-zA-Z0-9]{0,79}$/.test(item.source.field) ||
          Object.keys(item.source).length !== 2
        : !(
            item.source.value === null ||
            ['string', 'number', 'boolean'].includes(typeof item.source.value)
          ) || Object.keys(item.source).length !== 2
    )
      throw Error('Fonte da migração inválida.');
  }
  if (
    new Set(plan.migrations.map((item) => item.id)).size !== plan.migrations.length ||
    new Set(plan.migrations.map((item) => `${item.table}.${item.field}`)).size !==
      plan.migrations.length
  )
    throw Error('Migrações e campos precisam de identidades exclusivas.');
}
