import { internal } from './_generated/api';
import { assertWritesOpen } from './lib/maintenance';
import { query, mutation, internalMutation } from './_generated/server';
import { requireNativeUser } from './access/identity';
import type { Member } from './access/contracts';
import { globalRevision, bumpRevision } from './catalogue/model';
import { documentValue, documentDto } from './documents/model';
import { appendAudit } from './lib/audit';
import { admin } from './lib/authorization';
import { pageBound } from './lib/pagination';
import type { Context } from './lib/shared';
import { fail, text } from './lib/shared';
import { consumeUpload } from './lib/uploads';
import * as validators from './validators';
import { paginationOptsValidator } from 'convex/server';
import type { Infer } from 'convex/values';
import { v } from 'convex/values';

export function documentQuery(
  ctx: Context,
  user: Member,
  year?: number,
  status?: Infer<typeof validators.documentStatus>,
) {
  // Administrative filters never grant access to unpublished documents.
  if (status !== undefined) {
    admin(user);
    if (year !== undefined)
      return ctx.db
        .query('documents')
        .withIndex('by_year_and_status', (q) => q.eq('year', year).eq('status', status));
    return ctx.db.query('documents').withIndex('by_status', (q) => q.eq('status', status));
  }
  if (year === undefined)
    return user.role === 'ADMIN'
      ? ctx.db.query('documents')
      : ctx.db.query('documents').withIndex('by_publishedAt', (q) => q.gt('publishedAt', 0));
  return ctx.db
    .query('documents')
    .withIndex('by_year_and_publishedAt', (q) =>
      user.role === 'ADMIN' ? q.eq('year', year) : q.eq('year', year).gt('publishedAt', 0),
    );
}

export const documentPage = query({
  args: {
    paginationOpts: paginationOptsValidator,
    year: v.optional(v.number()),
    status: v.optional(validators.documentStatus),
  },
  returns: v.object({
    page: v.array(validators.documentMetadata),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { paginationOpts, year, status }) => {
    const { user } = await requireNativeUser(ctx);
    pageBound(paginationOpts.numItems);
    if (year !== undefined && (!Number.isInteger(year) || year < 1900 || year > 9999))
      fail('Ano inválido.');
    const collection = documentQuery(ctx, user, year, status);
    const result = await collection.order('desc').paginate(paginationOpts);
    return {
      page: result.page.map((row) => documentDto(documentValue(row))),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

export const documents = query({
  args: {},
  returns: v.object({ revision: v.number(), documents: v.array(validators.documentMetadata) }),
  handler: async (ctx) => {
    const { user } = await requireNativeUser(ctx);
    const rows = await ctx.db.query('documents').take(1001);
    if (rows.length > 1000) fail('Use a consulta paginada de documentos.');
    return {
      revision: await globalRevision(ctx),
      documents: rows
        .filter((d) => user.role === 'ADMIN' || d.publishedAt)
        .map((d) => documentDto(documentValue(d))),
    };
  },
});

export const documentStatus = mutation({
  args: {
    id: v.id('documents'),
    status: v.union(v.literal('vigente'), v.literal('arquivado')),
    revision: v.number(),
    confirmed: v.optional(v.boolean()),
  },
  returns: validators.documentMetadata,
  handler: async (ctx, { id, status, revision, confirmed }) => {
    await assertWritesOpen(ctx);
    const { user } = await requireNativeUser(ctx);
    admin(user);
    if (revision !== (await globalRevision(ctx)))
      fail('A base mudou. Atualize a lista antes de continuar.', 409);
    const row = await ctx.db.get(id);
    if (!row) fail('Documento não encontrado.', 404);
    if (status === 'vigente' && !confirmed)
      fail('Confirme a conferência do ano e da aplicabilidade do documento.');
    if (row.status === status) return documentDto(documentValue(row));
    const at = Date.now();
    if (status === 'vigente') {
      const prior = await ctx.db
        .query('documents')
        .withIndex('by_year_and_type_and_status', (q) =>
          q.eq('year', row.year).eq('type', row.type).eq('status', 'vigente'),
        )
        .take(101);
      if (prior.length > 100) fail('Excesso de documentos vigentes.');
      for (const old of prior) await ctx.db.patch(old._id, { status: 'arquivado', archivedAt: at });
    }
    await ctx.db.patch(
      id,
      status === 'vigente'
        ? { status, publishedAt: at, publishedBy: user.id }
        : { status, archivedAt: at },
    );
    await bumpRevision(ctx, row.year);
    await appendAudit(ctx, user, 'SET_INSTITUTIONAL_DOCUMENT_' + status.toUpperCase(), {
      type: 'document',
      id,
    });
    return documentDto(documentValue((await ctx.db.get(id))!));
  },
});

export const openDocument = mutation({
  args: { id: v.id('documents') },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, { id }): Promise<{ url: string }> => {
    await assertWritesOpen(ctx);
    const { user } = await requireNativeUser(ctx);
    const row = await ctx.db.get(id);
    if (!row || (user.role !== 'ADMIN' && !row.publishedAt)) fail('Documento não encontrado.', 404);
    if (!row.storageId || !(await ctx.db.system.get(row.storageId)))
      fail('Este PDF original aguarda restauração pela administração.', 503);
    const { url } = await ctx.runMutation(internal.nativeFiles.ticket, {
      storageId: row.storageId,
      filename: row.filename,
      ephemeral: false,
    });
    return { url };
  },
});

export const attachDocument = internalMutation({
  args: validators.documentUploadInput.fields,
  returns: validators.documentMetadata,
  handler: async (ctx, { uploadId, filename, year, type, title, source }) => {
    const { user, row: member } = await requireNativeUser(ctx);
    admin(user);
    if (!Number.isInteger(year) || year < 1900 || year > 9999) fail('Informe ano e tipo válidos.');
    const file = await consumeUpload(ctx, member._id, uploadId, filename);
    const previous = await ctx.db
      .query('documents')
      .withIndex('by_year_and_type_and_status', (q) => q.eq('year', year).eq('type', type))
      .take(1001);
    if (previous.length > 1000) fail('Limite de documentos excedido.');
    const id = await ctx.db.insert('documents', {
      year,
      type,
      title: text(title, 240),
      source: text(source, 1000),
      ...file,
      status: 'rascunho',
      version: 1 + Math.max(0, ...previous.map((d) => d.version)),
      createdAt: Date.now(),
      createdBy: user.id,
    });
    await appendAudit(ctx, user, 'UPLOAD_INSTITUTIONAL_DOCUMENT', { type: 'document', id });
    return documentDto(documentValue((await ctx.db.get(id))!));
  },
});
