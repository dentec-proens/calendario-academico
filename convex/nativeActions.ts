'use node';
import { createHash } from 'node:crypto';
import { v, ConvexError } from 'convex/values';
import { action } from './_generated/server';
import { internal } from './_generated/api';
import { nativePdf } from '../src/native-pdf.mjs';
import { analyzeHistory } from '../src/history-analysis.mjs';
import type { ActionCtx } from './_generated/server';

function fail(message: string, status = 400): never {
  throw new ConvexError({ error: message, status });
}
const validate = (bytes: Buffer) => {
  if (bytes.length < 5 || bytes.length > 8_000_000 || bytes.subarray(0, 5).toString() !== '%PDF-')
    fail('Envie um PDF de até 8 MB.');
  return bytes;
};
async function fileBytes(ctx: ActionCtx, item: any) {
  if (item.objectKey) {
    const id = await ctx.runQuery(internal.nativeFiles.fileId, { path: item.objectKey });
    const blob = id ? await ctx.storage.get(id) : null;
    if (!blob)
      fail(
        'Este PDF original aguarda a importação do Supabase. Seus dados e análises foram preservados.',
        503,
      );
    if (blob.size < 5 || blob.size > 8_000_000) fail('Envie um PDF de até 8 MB.');
    return validate(Buffer.from(await blob.arrayBuffer()));
  }
  if (typeof item.data === 'string') return validate(Buffer.from(item.data, 'base64'));
  return fail('Arquivo não encontrado.', 404);
}
export const completeUpload = action({
  args: { uploadId: v.string(), storageId: v.id('_storage') },
  returns: v.object({ uploadId: v.string() }),
  handler: async (ctx, { uploadId, storageId }): Promise<{ uploadId: string }> => {
    const upload = await ctx.runQuery(internal.nativeFiles.uploadContext, { uploadId });
    const blob = await ctx.storage.get(storageId);
    if (!blob) fail('Arquivo não encontrado.', 404);
    if (blob.size < 5 || blob.size > 8_000_000) fail('Envie um PDF de até 8 MB.');
    const bytes = validate(Buffer.from(await blob.arrayBuffer()));
    if (bytes.length !== upload.size) fail('O tamanho do PDF recebido é diferente do informado.');
    return await ctx.runMutation(internal.nativeFiles.finishUpload, {
      uploadId,
      storageId,
      size: bytes.length,
      hash: createHash('sha256').update(bytes).digest('hex'),
    });
  },
});
export const download = action({
  args: { path: v.string() },
  returns: v.object({ url: v.string(), filename: v.string() }),
  handler: async (ctx, { path }): Promise<{ url: string; filename: string }> => {
    if (!/^\/api\/(?:history|documents)\/[\w-]+$/.test(path)) fail('Arquivo não encontrado.', 404);
    const context = await ctx.runQuery(internal.native.actionContext, { path, body: {} });
    const item = context.history || context.document;
    if (!item) fail('Arquivo não encontrado.', 404);
    let id = item.objectKey
      ? await ctx.runQuery(internal.nativeFiles.fileId, { path: item.objectKey })
      : null;
    let ephemeral = false;
    if (!id) {
      id = await ctx.storage.store(
        new Blob([Uint8Array.from(await fileBytes(ctx, item))], { type: 'application/pdf' }),
      );
      ephemeral = true;
    }
    try {
      return await ctx.runMutation(internal.nativeFiles.ticket, {
        storageId: id,
        filename: item.filename,
        ephemeral,
      });
    } catch (error) {
      if (ephemeral) await ctx.storage.delete(id);
      throw error;
    }
  },
});
export const run = action({
  args: { path: v.string(), body: v.any() },
  returns: v.any(),
  handler: async (ctx, { path, body }): Promise<any> => {
    const pdf = /^\/api\/calendars\/[\w-]+\/pdf$/.test(path),
      analysis = /^\/api\/history\/[\w-]+\/analysis$/.test(path),
      upload = path === '/api/documents' || /^\/api\/calendars\/[\w-]+\/history$/.test(path);
    if (!pdf && !analysis && !upload) fail('Ação inválida.', 404);
    const context = await ctx.runQuery(internal.native.actionContext, { path, body });
    if (upload) {
      if (typeof body.uploadId !== 'string') fail('Envie o PDF antes de concluir o cadastro.');
      const file = await ctx.runQuery(internal.nativeFiles.uploadContext, {
        uploadId: body.uploadId,
      });
      if (!file.completedAt || !file.objectKey || !file.hash) fail('Envio do PDF incompleto.');
      return await ctx.runMutation(internal.native.finishAction, {
        path,
        body,
        result: {
          uploadId: file.uploadId,
          objectKey: file.objectKey,
          size: file.size,
          hash: file.hash,
        },
      });
    }
    if (analysis) {
      if (context.history.analysis?.version === 2) return context.history.analysis;
      let result;
      try {
        result = await analyzeHistory(await fileBytes(ctx, context.history));
      } catch {
        fail(
          'Não foi possível ler o texto deste PDF. Envie um arquivo sem senha e com texto selecionável. O documento continua guardado para consulta.',
          422,
        );
      }
      return await ctx.runMutation(internal.native.finishAction, {
        path,
        body: { ...body, hash: context.history.hash },
        result,
      });
    }
    const record = {
      ...context.record,
      proposalCopy: context.proposalCopy,
      readiness: context.readiness,
      currentCatalogueRevision: context.currentCatalogueRevision,
    };
    const bytes = await nativePdf(record, [
      ...record.institutionalSnapshot,
      ...record.state.events,
    ]);
    const storageId = await ctx.storage.store(
      new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' }),
    );
    const filename = `${record.purpose === 'test' ? 'teste-' : ''}calendario-${record.state.year}-v${record.version}.pdf`;
    try {
      return await ctx.runMutation(internal.nativeFiles.ticket, {
        storageId,
        filename,
        ephemeral: true,
      });
    } catch (error) {
      await ctx.storage.delete(storageId);
      throw error;
    }
  },
});
