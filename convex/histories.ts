import type { Id } from './_generated/dataModel';
import { internalQuery, internalMutation } from './_generated/server';
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
import { v } from 'convex/values';

export async function ownedHistory(ctx: Context, user: Member, id: Id<'histories'>) {
  const history = await ctx.db.get(id);
  if (!history) fail('Registro não encontrado.', 404);
  await calendarRow(ctx, user, history.calendarId);
  assertCampus(user, history.campusId);
  return history;
}

export const historyContext = internalQuery({
  args: { id: v.id('histories') },
  returns: contracts.historyContextDto,
  handler: async (ctx, { id }) => {
    const { user } = await requireNativeUser(ctx);
    const row = await ownedHistory(ctx, user, id);
    const analysis = await ctx.db
      .query('historyAnalyses')
      .withIndex('by_historyId', (q) => q.eq('historyId', id))
      .unique();
    const { _id, _creationTime: _creation, ...fields } = row;
    return {
      history: {
        ...fields,
        id: _id,
        createdAt: iso(row.createdAt),
        analyzed: !!analysis,
        ...(analysis ? { analysis: analysis.analysis } : {}),
      },
    };
  },
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
    const prior = await ctx.db
      .query('historyAnalyses')
      .withIndex('by_historyId', (q) => q.eq('historyId', id))
      .unique();
    if (prior) return prior.analysis;
    await ctx.db.insert('historyAnalyses', { historyId: id, analysis });
    await appendAudit(
      ctx,
      user,
      'ANALYZE_HISTORY',
      { type: 'history', id },
      { calendarId: row.calendarId, campusId: row.campusId },
    );
    return analysis;
  },
});
