'use node';
import { withActionLease } from '../lib/maintenance';
import { analyzeHistory as analyzePdfHistory } from '../../src/history-analysis';
import { HISTORY_EXTRACTOR_VERSION } from '../../src/history-dates';
import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { action } from '../_generated/server';
import { historyUploadInput, fileDownload, historyAnalysis } from '../validators';
import { downloadOriginal, fileBytes, fail } from './files';
import type { Infer } from 'convex/values';
import { v } from 'convex/values';

export const uploadHistory = action({
  args: historyUploadInput.fields,
  returns: v.object({ id: v.id('histories') }),
  handler: async (ctx, args): Promise<{ id: Id<'histories'> }> =>
    withActionLease(ctx, 'actions.history.uploadHistory', async () =>
      ctx.runMutation(internal.histories.attachHistory, args),
    ),
});

export const downloadHistory = action({
  args: { id: v.id('histories') },
  returns: fileDownload,
  handler: async (ctx, args): Promise<Infer<typeof fileDownload>> =>
    withActionLease(ctx, 'actions.history.downloadHistory', async () => {
      const { history } = await ctx.runQuery(internal.histories.historyContext, args);
      return downloadOriginal(ctx, history);
    }),
});

export const analyzeHistory = action({
  args: { id: v.id('histories') },
  returns: historyAnalysis,
  handler: async (ctx, args): Promise<Infer<typeof historyAnalysis>> =>
    withActionLease(ctx, 'actions.history.analyzeHistory', async () => {
      const { history } = await ctx.runQuery(internal.histories.historyContext, args);
      if (history.analysis) return history.analysis;
      const bytes = await fileBytes(ctx, history);
      let analysis: Infer<typeof historyAnalysis>;
      try {
        analysis = await analyzePdfHistory(bytes, history.year);
      } catch {
        fail(
          'Não foi possível ler o texto deste PDF. Envie um arquivo sem senha e com texto selecionável. O documento continua guardado para consulta.',
          422,
        );
      }
      return ctx.runMutation(internal.histories.saveHistoryAnalysis, {
        id: args.id,
        hash: history.hash,
        analysis,
      });
    }),
});

/** Explicit opt-in reanalysis creates another immutable extraction of the same bytes. */
export const reanalyzeHistory = action({
  args: { id: v.id('histories'), extractorVersion: v.number() },
  returns: historyAnalysis,
  handler: async (ctx, args): Promise<Infer<typeof historyAnalysis>> =>
    withActionLease(ctx, 'actions.history.reanalyzeHistory', async () => {
      if (args.extractorVersion !== HISTORY_EXTRACTOR_VERSION)
        fail('Versão do extrator não suportada. Atualize a aplicação.', 409);
      const { history } = await ctx.runQuery(internal.histories.historyContext, {
        id: args.id,
        reanalyzeVersion: args.extractorVersion,
      });
      const cached = history.analyses?.find(
        (item) => item.pdfHash === history.hash && item.extractorVersion === args.extractorVersion,
      );
      if (cached) {
        const { history: selected } = await ctx.runQuery(internal.histories.historyContext, {
          id: args.id,
          analysisId: cached.analysisId,
        });
        return selected.analysis!;
      }
      const bytes = await fileBytes(ctx, history);
      let analysis: Infer<typeof historyAnalysis>;
      try {
        analysis = await analyzePdfHistory(bytes, history.year);
      } catch {
        fail(
          'Não foi possível reanalisar o PDF. A análise anterior e seus vínculos foram preservados.',
          422,
        );
      }
      return ctx.runMutation(internal.histories.saveHistoryAnalysis, {
        id: args.id,
        hash: history.hash,
        analysis,
      });
    }),
});

export const restoreHistoryOriginal = action({
  args: { id: v.id('histories'), uploadId: v.string() },
  returns: v.object({ id: v.id('histories'), restored: v.literal(true) }),
  handler: async (ctx, args): Promise<{ id: Id<'histories'>; restored: true }> =>
    withActionLease(ctx, 'actions.history.restoreHistoryOriginal', async () =>
      ctx.runMutation(internal.nativeFiles.restoreHistoryOriginal, args),
    ),
});
