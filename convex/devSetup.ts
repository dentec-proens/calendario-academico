import { v } from 'convex/values';
import { chromiumArchives, parseChromiumManifest } from '../src/runtime/pdf/chromium-manifest';
import type { Infer } from 'convex/values';
import { environments } from '../config/environments';
import { campusNames, initialCatalogue } from '../src/domain/institution/catalogue.ts';
import { internalMutation } from './_generated/server';
import { isSupportedPasswordSecret } from './authCrypto';
import { setPassword } from './access/store';
import type { MutationCtx } from './_generated/server';
import type { TableNames } from './_generated/dataModel';
import schema from './schema';
import type { effect, modality } from './validators';

function assertE2EDevelopment(expectedCloudUrl: string) {
  if (
    expectedCloudUrl === environments.production.url ||
    process.env.CONVEX_CLOUD_URL !== expectedCloudUrl ||
    !/^https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.convex\.cloud$/.test(expectedCloudUrl)
  )
    throw Error(
      'A preparação E2E exige o desenvolvimento explicitamente conferido, nunca produção.',
    );
}

async function e2eCampus(ctx: MutationCtx, runId: string) {
  if (!/^[a-f0-9]{12}$/.test(runId)) throw Error('Identificador E2E inválido.');
  const name = `Testes E2E ${runId}`;
  const prior = await ctx.db
    .query('campuses')
    .withIndex('by_name', (q) => q.eq('name', name))
    .unique();
  if (prior?.archived) throw Error('A unidade E2E está arquivada. Prepare outra execução.');
  return prior?._id ?? ctx.db.insert('campuses', { name, archived: false });
}

export const prepareE2E = internalMutation({
  args: {
    expectedCloudUrl: v.string(),
    runId: v.string(),
    secret: v.string(),
    preferredYear: v.number(),
  },
  returns: v.object({ campusId: v.id('campuses'), userId: v.id('users'), year: v.number() }),
  handler: async (ctx, { expectedCloudUrl, runId, secret, preferredYear }) => {
    assertE2EDevelopment(expectedCloudUrl);
    if (!isSupportedPasswordSecret(secret)) throw Error('Credencial de teste inválida.');
    const campusId = await e2eCampus(ctx, runId);
    const email = `e2e-${runId}@ifpr.edu.br`;
    const name = `Testes E2E ${runId}`;
    const existing = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', email))
      .unique();
    if (
      existing &&
      (existing.name !== name ||
        existing.role !== 'ADMIN' ||
        existing.loginMethod !== 'local' ||
        !existing.active ||
        existing.removedAt !== undefined)
    )
      throw Error('A conta encontrada não pertence à preparação E2E.');
    let year = Math.max(7000, Math.min(8999, Math.trunc(preferredYear)));
    let available = false;
    for (let attempt = 0; attempt < 100; attempt++, year = year >= 8999 ? 7000 : year + 1) {
      const [calendar, document, event] = await Promise.all([
        ctx.db
          .query('calendars')
          .withIndex('by_year', (q) => q.eq('year', year))
          .first(),
        ctx.db
          .query('documents')
          .withIndex('by_year_and_type_and_status', (q) => q.eq('year', year))
          .first(),
        ctx.db
          .query('institutionalEvents')
          .withIndex('by_year', (q) => q.eq('year', year))
          .first(),
      ]);
      if (!calendar && !document && !event) {
        available = true;
        break;
      }
    }
    if (!available) throw Error('Não foi possível reservar um ano livre para os registros E2E.');
    const userId =
      existing?._id ??
      (await ctx.db.insert('users', {
        name,
        email,
        role: 'ADMIN',
        loginMethod: 'local',
        active: true,
      }));
    await setPassword(ctx, (await ctx.db.get(userId))!, secret);
    return { campusId, userId, year };
  },
});

export const prepareE2ERestoration = internalMutation({
  args: { expectedCloudUrl: v.string(), runId: v.string(), year: v.number(), hash: v.string() },
  returns: v.object({
    documentId: v.id('documents'),
  }),
  handler: async (ctx, { expectedCloudUrl, runId, year, hash }) => {
    assertE2EDevelopment(expectedCloudUrl);
    if (!Number.isInteger(year) || year < 7000 || year > 8999 || !/^[a-f0-9]{64}$/.test(hash))
      throw Error('Fixture E2E inválida.');
    await e2eCampus(ctx, runId);
    const source = {
      filename: 'original-e2e.pdf',
      hash,
      unavailableFile: { sourceReference: `e2e:${runId}`, reason: 'not_migrated' as const },
    };
    const documentId = await ctx.db.insert('documents', {
      year,
      type: 'referencia',
      title: `Restauração E2E ${runId}`,
      source: `Fixture E2E ${runId}`,
      ...source,
      status: 'rascunho',
      version: 1,
      createdAt: Date.now(),
    });
    return { documentId };
  },
});

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
    const runtimeIds = new Set<string>();
    try {
      const manifest = parseChromiumManifest(process.env.DENTEC_CHROMIUM_RUNTIME);
      for (const architecture of Object.values(manifest.architectures))
        for (const name of chromiumArchives) runtimeIds.add(architecture[name].storageId);
    } catch {
      // Unrecognized storage remains protected as application data.
    }
    const files = await ctx.db.system.query('_storage').take(runtimeIds.size + 1);
    if (files.some((file) => !runtimeIds.has(file._id)))
      return { initialized: false, setupRequired };

    for (const name of [...campusNames, 'Ponta Grossa', 'Toledo', 'Reitoria']) {
      await ctx.db.insert('campuses', { name, archived: false });
    }
    const catalogue = initialCatalogue();
    await ctx.db.insert('institutionSettings', { key: 'catalogue', revision: catalogue.revision });
    await ctx.db.insert('catalogueRevisions', { year: 2027, revision: catalogue.revision });
    for (const item of catalogue.events) {
      const { id: code, ...fields } = item;
      await ctx.db.insert('institutionalEvents', {
        ...fields,
        evidence: item.evidence ?? '',
        code,
        year: Number(item.start.slice(0, 4)),
        kind: item.kind as Infer<typeof effect>,
        modalities: item.modalities as Infer<typeof modality>[],
      });
    }
    return { initialized: true, setupRequired: true };
  },
});
