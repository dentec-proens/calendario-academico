import { v } from 'convex/values';
import type { Infer } from 'convex/values';
import { environments } from '../config/environments';
import { campusNames, initialCatalogue } from '../src/institution.ts';
import { internalMutation } from './_generated/server';
import type { TableNames } from './_generated/dataModel';
import schema from './schema';
import type { effect, modality } from './validators';

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

    const setupRequired = !(await ctx.db.query('users').first());
    // Derive the guard from the schema so a newly added table cannot silently
    // turn a partially populated deployment into an "empty" installation.
    for (const table of Object.keys(schema.tables) as TableNames[]) {
      if (await ctx.db.query(table).first()) return { initialized: false, setupRequired };
    }
    if (await ctx.db.system.query('_storage').first()) return { initialized: false, setupRequired };

    for (const name of [...campusNames, 'Ponta Grossa', 'Toledo', 'Reitoria']) {
      await ctx.db.insert('campuses', { name, archived: false });
    }
    const catalogue = initialCatalogue();
    await ctx.db.insert('institutionSettings', { key: 'catalogue', revision: catalogue.revision });
    await ctx.db.insert('catalogueRevisions', { year: 2027, revision: catalogue.revision });
    for (const item of catalogue.events) {
      const { id: code, offers: modalities, ...fields } = item;
      await ctx.db.insert('institutionalEvents', {
        ...fields,
        code,
        year: Number(item.start.slice(0, 4)),
        kind: item.kind as Infer<typeof effect>,
        modalities: modalities as Infer<typeof modality>[],
      });
    }
    return { initialized: true, setupRequired: true };
  },
});
