import { v } from 'convex/values';
import { environments } from '../config/environments';
import { campusNames, initialCatalogue } from '../src/institution.mjs';
import { encodeValue } from '../src/convex-codec.mjs';
import { internalMutation } from './_generated/server';
import type { TableNames } from './_generated/dataModel';
import { entityTables } from './model';
import type { SnapshotChange } from './model';
import { applyChanges } from './store';

// Check every application/Auth table before seeding. A partially initialized dev
// is existing data too; setup must never fill, replace or reinterpret its rows.
const tables = [
  ...entityTables,
  'rootFields',
  'scopeVersions',
  'calendarVersions',
  'calendarSnapshots',
  'reviewVersions',
  'fileObjects',
  'nativeUploads',
  'nativeFileTickets',
  'authAccounts',
  'authSessions',
  'authRefreshTokens',
  'authVerificationCodes',
  'authVerifiers',
  'authRateLimits',
] satisfies TableNames[];

export const initialize = internalMutation({
  args: { expectedCloudUrl: v.string() },
  returns: v.object({ initialized: v.boolean(), setupRequired: v.boolean() }),
  handler: async (ctx, { expectedCloudUrl }) => {
    const actualUrl = process.env.CONVEX_CLOUD_URL;
    if (
      expectedCloudUrl === environments.production.url ||
      actualUrl === environments.production.url ||
      !/^https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.convex\.cloud$/.test(expectedCloudUrl) ||
      expectedCloudUrl !== actualUrl
    )
      throw Error('A inicialização exige o mesmo deployment dev validado pelo dev:setup.');

    const setupRequired = !(await ctx.db.query('users').withIndex('by_position').first());
    for (const table of tables) {
      if (await ctx.db.query(table).first()) return { initialized: false, setupRequired };
    }
    if (await ctx.db.system.query('_storage').first()) return { initialized: false, setupRequired };

    const names = [...campusNames, 'Ponta Grossa', 'Toledo', 'Reitoria'];
    const changes: SnapshotChange[] = entityTables.map((field) => ({
      field,
      upserts:
        field === 'campuses'
          ? names.map((name, position) => {
              const id = `campus-${position + 1}`;
              return { key: `campuses:${id}`, position, value: encodeValue({ id, name }) };
            })
          : [],
    }));
    changes.push({ field: 'catalogue', value: encodeValue(initialCatalogue()) });
    await applyChanges(ctx, changes, { full: true });
    return { initialized: true, setupRequired: true };
  },
});
