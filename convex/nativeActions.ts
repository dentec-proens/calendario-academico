'use node';
import { createHash } from 'node:crypto';
import { v, ConvexError } from 'convex/values';
import { action } from './_generated/server';
import { internal } from './_generated/api';
import { nativePdf } from '../src/native-pdf.mjs';
import { analyzeHistory as analyzePdfHistory } from '../src/history-analysis.mjs';
import {
  pdfRequest,
  historyUploadInput,
  documentUploadInput,
  fileDownload,
  documentMetadata,
  historyAnalysis,
} from './validators';
import type { ActionCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import type { Infer } from 'convex/values';

function fail(message: string, status = 400): never {
  throw new ConvexError({ error: message, status });
}
const validate = (bytes: Buffer) => {
  if (bytes.length < 5 || bytes.length > 8_000_000 || bytes.subarray(0, 5).toString() !== '%PDF-')
    fail('Envie um PDF de até 8 MB.');
  return bytes;
};
const missingOriginal = () =>
  fail(
    'Este PDF original aguarda a transferência para o armazenamento atual. Seus dados e análises foram preservados.',
    503,
  );

type FileSource = { storageId?: Id<'_storage'>; filename: string };
async function original(ctx: ActionCtx, item: FileSource) {
  if (!item.storageId) return missingOriginal();
  const blob = await ctx.storage.get(item.storageId);
  if (!blob) return missingOriginal();
  return blob;
}
async function fileBytes(ctx: ActionCtx, item: FileSource) {
  const blob = await original(ctx, item);
  if (blob.size < 5 || blob.size > 8_000_000) fail('Envie um PDF de até 8 MB.');
  return validate(Buffer.from(await blob.arrayBuffer()));
}
async function downloadOriginal(ctx: ActionCtx, item: FileSource) {
  await original(ctx, item);
  return ctx.runMutation(internal.nativeFiles.ticket, {
    storageId: item.storageId!,
    filename: item.filename,
    ephemeral: false,
  });
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
    return ctx.runMutation(internal.nativeFiles.finishUpload, {
      uploadId,
      storageId,
      size: bytes.length,
      hash: createHash('sha256').update(bytes).digest('hex'),
    });
  },
});

export const uploadHistory = action({
  args: historyUploadInput.fields,
  returns: v.object({ id: v.id('histories') }),
  handler: async (ctx, args): Promise<{ id: Id<'histories'> }> =>
    ctx.runMutation(internal.native.attachHistory, args),
});

export const uploadDocument = action({
  args: documentUploadInput.fields,
  returns: documentMetadata,
  handler: async (ctx, args): Promise<Infer<typeof documentMetadata>> =>
    ctx.runMutation(internal.native.attachDocument, args),
});

export const downloadHistory = action({
  args: { id: v.id('histories') },
  returns: fileDownload,
  handler: async (ctx, args): Promise<Infer<typeof fileDownload>> => {
    const { history } = await ctx.runQuery(internal.native.historyContext, args);
    return downloadOriginal(ctx, history);
  },
});

export const downloadDocument = action({
  args: { id: v.id('documents') },
  returns: fileDownload,
  handler: async (ctx, args): Promise<Infer<typeof fileDownload>> => {
    const { document } = await ctx.runQuery(internal.native.documentContext, args);
    return downloadOriginal(ctx, document);
  },
});

export const analyzeHistory = action({
  args: { id: v.id('histories') },
  returns: historyAnalysis,
  handler: async (ctx, args): Promise<Infer<typeof historyAnalysis>> => {
    const { history } = await ctx.runQuery(internal.native.historyContext, args);
    if (history.analysis) return history.analysis;
    const bytes = await fileBytes(ctx, history);
    let analysis: Infer<typeof historyAnalysis>;
    try {
      analysis = await analyzePdfHistory(bytes);
    } catch {
      fail(
        'Não foi possível ler o texto deste PDF. Envie um arquivo sem senha e com texto selecionável. O documento continua guardado para consulta.',
        422,
      );
    }
    return ctx.runMutation(internal.native.saveHistoryAnalysis, {
      id: args.id,
      hash: history.hash,
      analysis,
    });
  },
});

export const generatePdf = action({
  args: pdfRequest.fields,
  returns: fileDownload,
  handler: async (ctx, args): Promise<Infer<typeof fileDownload>> => {
    const context = await ctx.runQuery(internal.native.pdfContext, args);
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

export const restoreHistoryOriginal = action({
  args: { id: v.id('histories'), uploadId: v.string() },
  returns: v.object({ id: v.id('histories'), restored: v.literal(true) }),
  handler: async (ctx, args): Promise<{ id: Id<'histories'>; restored: true }> =>
    ctx.runMutation(internal.nativeFiles.restoreHistoryOriginal, args),
});

export const restoreDocumentOriginal = action({
  args: { id: v.id('documents'), uploadId: v.string() },
  returns: v.object({ id: v.id('documents'), restored: v.literal(true) }),
  handler: async (ctx, args): Promise<{ id: Id<'documents'>; restored: true }> =>
    ctx.runMutation(internal.nativeFiles.restoreDocumentOriginal, args),
});
