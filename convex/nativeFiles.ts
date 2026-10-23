import { v, ConvexError } from 'convex/values';
import { mutation, internalMutation, internalQuery, httpAction } from './_generated/server';
import { internal } from './_generated/api';
import { requireNativeUser } from './nativeAuth';
import { calendarEditor } from './repository';
import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';

function failure(message: string, status = 400): never {
  throw new ConvexError({ error: message, status });
}
const randomToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
const hashToken = async (token: string) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');

const uploadRecord = v.object({
  _id: v.id('nativeUploads'),
  _creationTime: v.number(),
  uploadId: v.string(),
  ownerId: v.id('users'),
  filename: v.string(),
  size: v.number(),
  expiresAt: v.number(),
  storageId: v.optional(v.id('_storage')),
  hash: v.optional(v.string()),
  completedAt: v.optional(v.number()),
  consumedAt: v.optional(v.number()),
});
const fileTicket = v.object({
  _id: v.id('nativeFileTickets'),
  _creationTime: v.number(),
  tokenHash: v.string(),
  storageId: v.id('_storage'),
  filename: v.string(),
  expiresAt: v.number(),
  ephemeral: v.boolean(),
});

export const issueUpload = mutation({
  args: { filename: v.string(), size: v.number() },
  returns: v.object({ uploadUrl: v.string(), uploadId: v.string() }),
  handler: async (ctx, { filename, size }) => {
    const { row, user } = await requireNativeUser(ctx);
    calendarEditor(user);
    if (
      filename.length > 180 ||
      !filename.toLowerCase().endsWith('.pdf') ||
      !Number.isInteger(size) ||
      size < 5 ||
      size > 8_000_000
    )
      failure('Escolha um PDF de até 8 MB.');
    const existing = await ctx.db
      .query('nativeUploads')
      .withIndex('by_ownerId', (q) => q.eq('ownerId', row._id))
      .take(101);
    if (
      existing.length > 100 ||
      existing.filter((u) => u.expiresAt > Date.now() && !u.consumedAt).length >= 3
    )
      failure('Conclua os envios pendentes antes de enviar outro PDF.', 409);
    const uploadId = randomToken();
    await ctx.db.insert('nativeUploads', {
      uploadId,
      ownerId: row._id,
      filename,
      size,
      expiresAt: Date.now() + 15 * 60_000,
    });
    await ctx.scheduler.runAfter(16 * 60_000, internal.nativeFiles.expireUpload, { uploadId });
    return { uploadId, uploadUrl: await ctx.storage.generateUploadUrl() };
  },
});

export const uploadContext = internalQuery({
  args: { uploadId: v.string() },
  returns: uploadRecord,
  handler: async (ctx, { uploadId }) => {
    const { row, user } = await requireNativeUser(ctx);
    calendarEditor(user);
    const upload = await ctx.db
      .query('nativeUploads')
      .withIndex('by_uploadId', (q) => q.eq('uploadId', uploadId))
      .unique();
    if (
      !upload ||
      upload.ownerId !== row._id ||
      upload.expiresAt <= Date.now() ||
      upload.consumedAt
    )
      failure('Envio expirado ou não encontrado.', 404);
    return upload;
  },
});
export const finishUpload = internalMutation({
  args: { uploadId: v.string(), storageId: v.id('_storage'), hash: v.string(), size: v.number() },
  returns: v.object({ uploadId: v.string() }),
  handler: async (ctx, args) => {
    const { row, user } = await requireNativeUser(ctx);
    calendarEditor(user);
    const upload = await ctx.db
      .query('nativeUploads')
      .withIndex('by_uploadId', (q) => q.eq('uploadId', args.uploadId))
      .unique();
    if (
      !upload ||
      upload.ownerId !== row._id ||
      upload.expiresAt <= Date.now() ||
      upload.consumedAt ||
      upload.size !== args.size ||
      !/^[a-f0-9]{64}$/.test(args.hash)
    )
      failure('Envio expirado ou inválido.');
    if (upload.completedAt) {
      if (upload.storageId !== args.storageId) failure('Envio já concluído.', 409);
      return { uploadId: args.uploadId };
    }
    const [pending, history, document] = await Promise.all([
      ctx.db
        .query('nativeUploads')
        .withIndex('by_storageId', (q) => q.eq('storageId', args.storageId))
        .unique(),
      ctx.db
        .query('histories')
        .withIndex('by_storageId', (q) => q.eq('storageId', args.storageId))
        .first(),
      ctx.db
        .query('documents')
        .withIndex('by_storageId', (q) => q.eq('storageId', args.storageId))
        .first(),
    ]);
    if (pending || history || document) failure('Arquivo já cadastrado.', 409);
    await ctx.db.patch(upload._id, {
      storageId: args.storageId,
      hash: args.hash,
      completedAt: Date.now(),
    });
    return { uploadId: args.uploadId };
  },
});
export const expireUpload = internalMutation({
  args: { uploadId: v.string() },
  returns: v.null(),
  handler: async (ctx, { uploadId }) => {
    const upload = await ctx.db
      .query('nativeUploads')
      .withIndex('by_uploadId', (q) => q.eq('uploadId', uploadId))
      .unique();
    if (!upload) return null;
    if (!upload.consumedAt && upload.storageId) {
      await ctx.storage.delete(upload.storageId);
    }
    await ctx.db.delete(upload._id);
    return null;
  },
});

export const ticket = internalMutation({
  args: { storageId: v.id('_storage'), filename: v.string(), ephemeral: v.boolean() },
  returns: v.object({ url: v.string(), filename: v.string() }),
  handler: async (ctx, { storageId, filename, ephemeral }) => {
    await requireNativeUser(ctx);
    const token = randomToken(),
      tokenHash = await hashToken(token);
    const id = await ctx.db.insert('nativeFileTickets', {
      tokenHash,
      storageId,
      filename,
      ephemeral,
      expiresAt: Date.now() + 60_000,
    });
    await ctx.scheduler.runAfter(5 * 60_000, internal.nativeFiles.expireTicket, { id });
    return { url: process.env.CONVEX_SITE_URL + '/files/' + token, filename };
  },
});
export const resolveTicket = internalMutation({
  args: { token: v.string() },
  returns: v.union(fileTicket, v.null()),
  handler: async (ctx, { token }) => {
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const tokenHash = await hashToken(token);
    const ticket = await ctx.db
      .query('nativeFileTickets')
      .withIndex('by_tokenHash', (q) => q.eq('tokenHash', tokenHash))
      .unique();
    return ticket && ticket.expiresAt > Date.now() ? ticket : null;
  },
});
export const expireTicket = internalMutation({
  args: { id: v.id('nativeFileTickets') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const ticket = await ctx.db.get(id);
    if (!ticket) return null;
    if (ticket.ephemeral) await ctx.storage.delete(ticket.storageId);
    await ctx.db.delete(id);
    return null;
  },
});
export const downloadHttp = httpAction(async (ctx, request) => {
  const token = new URL(request.url).pathname.slice('/files/'.length);
  const ticket = await ctx.runMutation(internal.nativeFiles.resolveTicket, { token });
  const headers = {
    'Access-Control-Allow-Origin': process.env.SITE_URL || 'http://127.0.0.1:4183',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
  if (!ticket)
    return new Response('Arquivo não encontrado ou link expirado.', { status: 404, headers });
  const file = await ctx.storage.get(ticket.storageId);
  if (!file) return new Response('Arquivo não encontrado.', { status: 404, headers });
  return new Response(file, {
    headers: {
      ...headers,
      'Content-Type': 'application/pdf',
      'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(ticket.filename),
    },
  });
});

async function restorationUpload(
  ctx: MutationCtx,
  ownerId: Id<'users'>,
  uploadId: string,
  hash: string,
) {
  const upload = await ctx.db
    .query('nativeUploads')
    .withIndex('by_uploadId', (q) => q.eq('uploadId', uploadId))
    .unique();
  if (
    !upload ||
    upload.ownerId !== ownerId ||
    upload.expiresAt <= Date.now() ||
    !upload.completedAt ||
    upload.consumedAt ||
    !upload.storageId ||
    !upload.hash
  )
    failure('Envio expirado, já utilizado ou incompatível.', 409);
  if (upload.hash !== hash) failure('O SHA-256 não corresponde ao PDF original registrado.');
  const [history, document, stored] = await Promise.all([
    ctx.db
      .query('histories')
      .withIndex('by_storageId', (q) => q.eq('storageId', upload.storageId))
      .first(),
    ctx.db
      .query('documents')
      .withIndex('by_storageId', (q) => q.eq('storageId', upload.storageId))
      .first(),
    ctx.db.system.get(upload.storageId),
  ]);
  if (history || document) failure('Arquivo já cadastrado.', 409);
  if (!stored) failure('Arquivo validado indisponível.', 409);
  await ctx.db.patch(upload._id, { consumedAt: Date.now() });
  return upload.storageId;
}

export const restoreHistoryOriginal = internalMutation({
  args: { id: v.id('histories'), uploadId: v.string() },
  returns: v.object({ id: v.id('histories'), restored: v.literal(true) }),
  handler: async (ctx, { id, uploadId }) => {
    const { user, row: member } = await requireNativeUser(ctx);
    if (user.role !== 'ADMIN') failure('Acesso exclusivo da administração.', 403);
    const row = await ctx.db.get(id);
    if (!row) failure('PDF histórico não encontrado.', 404);
    if (row.storageId || !row.unavailableFile) failure('O PDF original já está disponível.', 409);
    const calendar = await ctx.db.get(row.calendarId);
    if (!calendar || calendar.campusId !== row.campusId)
      failure('Vínculo histórico inválido.', 409);
    const storageId = await restorationUpload(ctx, member._id, uploadId, row.hash);
    await ctx.db.patch(id, { storageId, unavailableFile: undefined });
    await ctx.db.insert('audit', {
      at: Date.now(),
      actorId: user.id,
      action: 'RESTORE_HISTORY_ORIGINAL',
      target: { type: 'history', id },
      calendarId: row.calendarId,
      campusId: row.campusId,
    });
    return { id, restored: true as const };
  },
});

export const restoreDocumentOriginal = internalMutation({
  args: { id: v.id('documents'), uploadId: v.string() },
  returns: v.object({ id: v.id('documents'), restored: v.literal(true) }),
  handler: async (ctx, { id, uploadId }) => {
    const { user, row: member } = await requireNativeUser(ctx);
    if (user.role !== 'ADMIN') failure('Acesso exclusivo da administração.', 403);
    const row = await ctx.db.get(id);
    if (!row) failure('Documento não encontrado.', 404);
    if (row.storageId || !row.unavailableFile) failure('O PDF original já está disponível.', 409);
    const storageId = await restorationUpload(ctx, member._id, uploadId, row.hash);
    await ctx.db.patch(id, { storageId, unavailableFile: undefined });
    await ctx.db.insert('audit', {
      at: Date.now(),
      actorId: user.id,
      action: 'RESTORE_DOCUMENT_ORIGINAL',
      target: { type: 'document', id },
    });
    return { id, restored: true as const };
  },
});

export const cleanupExpired = internalMutation({
  args: {},
  returns: v.object({ uploads: v.number(), tickets: v.number(), continued: v.boolean() }),
  handler: async (ctx) => {
    const now = Date.now();
    const [uploads, tickets] = await Promise.all([
      ctx.db
        .query('nativeUploads')
        .withIndex('by_expiresAt', (q) => q.lte('expiresAt', now))
        .take(100),
      ctx.db
        .query('nativeFileTickets')
        .withIndex('by_expiresAt', (q) => q.lte('expiresAt', now))
        .take(100),
    ]);
    for (const row of uploads) {
      if (!row.consumedAt && row.storageId) await ctx.storage.delete(row.storageId);
      await ctx.db.delete(row._id);
    }
    for (const row of tickets) {
      if (row.ephemeral) await ctx.storage.delete(row.storageId);
      await ctx.db.delete(row._id);
    }
    const continued = uploads.length === 100 || tickets.length === 100;
    if (continued) await ctx.scheduler.runAfter(0, internal.nativeFiles.cleanupExpired, {});
    return { uploads: uploads.length, tickets: tickets.length, continued };
  },
});
