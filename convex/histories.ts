import type { Doc, Id } from './_generated/dataModel';
import { HISTORY_EXTRACTOR_VERSION } from '../src/history-dates';
import { internalQuery, internalMutation, query, type QueryCtx } from './_generated/server';
import { requireNativeUser } from './access/identity';
import type { Member } from './authContracts';
import { calendarRow } from './calendars/model';
import * as contracts from './contracts';
import { appendAudit } from './lib/audit';
import { calendarEditor, assertCampus } from './lib/authorization';
import type { Context } from './lib/shared';
import { fail, iso } from './lib/shared';
import { consumeUpload } from './lib/uploads';
import * as validators from './validators';
import { v, type Infer } from 'convex/values';

/** Decorate an immutable analysis row; the stored candidate keys never change. */
export function analysisDto(row: Doc<'historyAnalyses'>, history: Doc<'histories'>) {
  return {
    ...row.analysis,
    analysisId: row._id,
    extractorVersion: row.extractorVersion ?? row.analysis.version,
    pdfHash: row.pdfHash ?? history.hash,
    documentYear: row.analysis.documentYear ?? history.year,
  };
}
function versionDto(row: Doc<'historyAnalyses'>, history: Doc<'histories'>) {
  return {
    analysisId: row._id,
    extractorVersion: row.extractorVersion ?? row.analysis.version,
    pdfHash: row.pdfHash ?? history.hash,
    analyzedAt: row.analysis.analyzedAt,
  };
}

export async function originalAnalysis(ctx: Context, history: Doc<'histories'>) {
  if (history.legacyAnalysisId) {
    const original = await ctx.db.get(history.legacyAnalysisId);
    if (original?.historyId === history._id) return original;
    return null;
  }
  return ctx.db
    .query('historyAnalyses')
    .withIndex('by_historyId', (q) => q.eq('historyId', history._id))
    .order('asc')
    .first();
}

export async function ownedHistory(ctx: Context, user: Member, id: Id<'histories'>) {
  const history = await ctx.db.get(id);
  if (!history) fail('Registro não encontrado.', 404);
  const calendar = await calendarRow(ctx, user, history.calendarId);
  if (
    history.campusId !== calendar.campusId ||
    !history.modalities.length ||
    history.modalities.some((modality) => !calendar.modalities.includes(modality))
  )
    fail('Referência histórica incompatível com o campus ou as ofertas do calendário.', 404);
  assertCampus(user, history.campusId);
  return history;
}

const contextArgs = v.object({
  id: v.id('histories'),
  analysisId: v.optional(v.id('historyAnalyses')),
  reanalyzeVersion: v.optional(v.number()),
});
async function readHistoryContext(
  ctx: QueryCtx,
  { id, analysisId, reanalyzeVersion }: Infer<typeof contextArgs>,
) {
  const { user } = await requireNativeUser(ctx);
  if (reanalyzeVersion !== undefined) {
    calendarEditor(user);
    if (reanalyzeVersion !== HISTORY_EXTRACTOR_VERSION)
      fail('Versão do extrator não suportada. Atualize a aplicação.', 409);
  }
  const row = await ownedHistory(ctx, user, id);
  // Legacy installations had exactly one analysis. New versions keep a small
  // manifest so listing versions never reads every PDF extraction body.
  const original = row.analysisVersions ? null : await originalAnalysis(ctx, row);
  const analyses = row.analysisVersions ?? (original ? [versionDto(original, row)] : []);
  if (analyses.length > 100) fail('Limite de análises deste PDF excedido.');
  const selectedId = analysisId ?? analyses.at(-1)?.analysisId;
  const selected = selectedId ? await ctx.db.get(selectedId) : null;
  if (selectedId && (!selected || selected.historyId !== id))
    fail('Análise não pertence a este PDF.', 404);
  const originalId = row.legacyAnalysisId ?? analyses[0]?.analysisId;
  const { _id, _creationTime: _creation, analysisVersions: _versions, ...fields } = row;
  return {
    history: {
      ...fields,
      id: _id,
      createdAt: iso(row.createdAt),
      analyzed: !!selected,
      ...(selected ? { analysis: analysisDto(selected, row) } : {}),
      ...(analyses.at(-1) ? { latestAnalysisId: analyses.at(-1)!.analysisId } : {}),
      ...(originalId ? { originalAnalysisId: originalId } : {}),
      analyses: [...analyses].reverse(),
    },
  };
}
export const historyContext = internalQuery({
  args: contextArgs.fields,
  returns: contracts.historyContextDto,
  handler: readHistoryContext,
});
export const analysisVersions = query({
  args: { id: v.id('histories'), analysisId: v.optional(v.id('historyAnalyses')) },
  returns: contracts.historyContextDto,
  handler: readHistoryContext,
});

export const attachHistory = internalMutation({
  args: validators.historyUploadInput.fields,
  returns: v.object({ id: v.id('histories') }),
  handler: async (ctx, { calendarId, uploadId, filename, year, notes }) => {
    const { user, row: member } = await requireNativeUser(ctx);
    calendarEditor(user);
    const row = await calendarRow(ctx, user, calendarId);
    if (year !== row.year - 1) fail('Informe o ano anterior ao calendário em elaboração.');
    const files = await ctx.db
      .query('histories')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', calendarId))
      .take(100);
    if (files.length >= 100) fail('Limite de PDFs anteriores por calendário excedido.');
    const { size: _size, ...file } = await consumeUpload(ctx, member._id, uploadId, filename);
    const id = await ctx.db.insert('histories', {
      calendarId,
      campusId: row.campusId,
      year,
      modalities: row.modalities,
      ...file,
      notes: (notes ?? '').slice(0, 5000),
      createdAt: Date.now(),
    });
    await appendAudit(
      ctx,
      user,
      'UPLOAD_HISTORY',
      { type: 'history', id },
      { calendarId, campusId: row.campusId },
    );
    return { id };
  },
});

export const saveHistoryAnalysis = internalMutation({
  args: { id: v.id('histories'), hash: v.string(), analysis: validators.historyAnalysis },
  returns: validators.historyAnalysis,
  handler: async (ctx, { id, hash, analysis }) => {
    const { user } = await requireNativeUser(ctx);
    calendarEditor(user);
    const row = await ownedHistory(ctx, user, id);
    if (row.hash !== hash) fail('O arquivo histórico mudou durante a análise.', 409);
    const extractorVersion = analysis.extractorVersion ?? analysis.version;
    if (
      extractorVersion !== HISTORY_EXTRACTOR_VERSION ||
      analysis.version !== extractorVersion ||
      (analysis.pdfHash !== undefined && analysis.pdfHash !== hash)
    )
      fail('Versão do extrator não suportada. Atualize a aplicação.', 409);
    const prior = await ctx.db
      .query('historyAnalyses')
      .withIndex('by_historyId_and_pdfHash_and_extractorVersion', (q) =>
        q.eq('historyId', id).eq('pdfHash', hash).eq('extractorVersion', extractorVersion),
      )
      .unique();
    if (prior) return analysisDto(prior, row);
    // Pin the original before introducing a second analysis. Legacy evidence can
    // always resolve its original candidate even if a newer extractor omits it.
    const original = await originalAnalysis(ctx, row);
    const versions = row.analysisVersions ?? (original ? [versionDto(original, row)] : []);
    if (versions.length >= 100) fail('Limite de análises deste PDF excedido.');
    const { analysisId: _id, pdfHash: _hash, ...body } = analysis;
    const analysisId = await ctx.db.insert('historyAnalyses', {
      historyId: id,
      analysis: { ...body, extractorVersion, documentYear: row.year },
      pdfHash: hash,
      extractorVersion,
    });
    await ctx.db.patch(id, {
      legacyAnalysisId: row.legacyAnalysisId ?? original?._id ?? analysisId,
      analysisVersions: [
        ...versions,
        { analysisId, extractorVersion, pdfHash: hash, analyzedAt: analysis.analyzedAt },
      ],
    });
    await appendAudit(
      ctx,
      user,
      'ANALYZE_HISTORY',
      { type: 'history', id },
      { calendarId: row.calendarId, campusId: row.campusId },
    );
    return analysisDto((await ctx.db.get(analysisId))!, row);
  },
});
