import { Migrations } from '@convex-dev/migrations';
import type { MigrationFunctionReference } from '@convex-dev/migrations';
import { v } from 'convex/values';
import { components } from './_generated/api';
import { internalMutation, internalQuery } from './_generated/server';
import schema from './schema';

export const migrations = new Migrations(components.migrations, { schema });

// Migrações da próxima publicação, em ordem. O deploy de produção as inicia
// depois do backend e só promove o frontend quando todas terminam; as já
// concluídas são ignoradas. Esvazie a lista quando o schema for estreitado.
const pending: MigrationFunctionReference[] = [];

export const start = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await migrations.runSerially(ctx, pending);
    return null;
  },
});

export const status = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      name: v.string(),
      state: v.union(
        v.literal('inProgress'),
        v.literal('success'),
        v.literal('failed'),
        v.literal('canceled'),
        v.literal('unknown'),
      ),
      processed: v.number(),
      error: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    if (!pending.length) return [];
    const statuses = await migrations.getStatus(ctx, { migrations: pending });
    return statuses.map(({ name, state, processed, error }) => ({
      name,
      state,
      processed,
      error: error ?? null,
    }));
  },
});
