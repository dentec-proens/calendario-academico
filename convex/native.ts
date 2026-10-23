import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import type { Infer } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { query, mutation, internalQuery, internalMutation } from './_generated/server';
import type { QueryCtx, MutationCtx } from './_generated/server';
import { requireNativeUser, safeMember } from './nativeAuth';
import type { Member } from './authContracts';
import * as contracts from './contracts';
import * as validators from './validators';
import {
  admin,
  fail,
  iso,
  text,
  clean,
  assertCampus,
  calendarRow,
  contents,
  catalogue,
  globalRevision,
  bumpRevision,
  summary,
  domainState,
  toContent,
  documentValue,
  documentDto,
  currentDocuments,
  appendAudit,
  reviewRow,
  reviewDto,
} from './repository';
import { equalValues } from '../src/equal';
import { readAuditPage, logEntry } from './audit';
import { normalizeCalendar } from '../src/calendar-normalize.mjs';
import { inheritedEvents } from '../src/institution.mjs';
import { datesBetween } from '../src/calendar.ts';
import { validCategory } from '../src/categories.mjs';
import { releaseReadiness } from '../src/release.mjs';
import { recalculatePeriods } from '../src/duration.mjs';
import { recalculateAssessmentStages } from '../src/stage-suggestions.mjs';
import { historyCandidateKey } from '../src/history-progress.mjs';
import { reviewSupport, reviewCriteria, initialConclusion } from '../src/review.mjs';
import { reviewNorm, presentReviewText } from '../src/review-presentation.mjs';
import { updateConclusion } from '../src/review-conclusion.mjs';
import { reviewDocument } from '../src/review-export.mjs';

type Context = QueryCtx | MutationCtx;
const idArgs = { id: v.id('calendars') };
const ok = v.object({ ok: v.boolean() });
async function baseRecord(ctx: Context, user: Member, id: Id<'calendars'>) {
  const row = await calendarRow(ctx, user, id),
    [content, campus, base, docs, review] = await Promise.all([
      contents(ctx, id),
      ctx.db.get(row.campusId),
      catalogue(ctx, row.year),
      currentDocuments(ctx, row.year),
      reviewRow(ctx, id),
    ]);
  if (!campus) fail('Campus não encontrado.', 404);
  const record = {
    ...summary(row, campus),
    state: domainState(row, campus, content.state),
    catalogueRevision: content.catalogueRevision,
    documentSnapshot: content.documentSnapshot.map(documentDto),
    institutionalSnapshot: content.institutionalSnapshot,
  };
  const readiness = releaseReadiness(record, {
    catalogue: base,
    reviews: review ? [reviewDto(review)] : [],
  }) as Infer<typeof contracts.readiness>;
  return { row, content, record, base, docs, review, readiness };
}
async function fullRecord(
  ctx: Context,
  user: Member,
  id: Id<'calendars'>,
): Promise<Infer<typeof contracts.calendarDto>> {
  const { record, base, docs, readiness } = await baseRecord(ctx, user, id);
  const versions = await ctx.db
    .query('calendarVersions')
    .withIndex('by_calendarId_and_version', (q) => q.eq('calendarId', id))
    .order('desc')
    .take(50);
  const histories = await ctx.db
    .query('histories')
    .withIndex('by_calendarId', (q) => q.eq('calendarId', id))
    .take(101);
  if (histories.length > 100) fail('Limite de PDFs anteriores por calendário excedido.');
  return clean({
    ...record,
    versions: versions.map((row) => ({
      version: row.version,
      at: iso(row.at),
      catalogueRevision: row.catalogueRevision,
    })),
    readiness,
    institutionalEvents: inheritedEvents(
      base,
      record.state.year,
      record.state.modalities,
      record.state,
    ),
    currentCatalogueRevision: base.revision,
    currentDocuments: docs.map(documentDto),
    histories: await Promise.all(
      histories.map(async ({ _id, _creationTime: _creation, ...fields }) => ({
        ...fields,
        id: _id,
        createdAt: iso(fields.createdAt),
        analyzed: !!(await ctx.db
          .query('historyAnalyses')
          .withIndex('by_historyId', (q) => q.eq('historyId', _id))
          .first()),
      })),
    ),
  });
}
async function archive(ctx: MutationCtx, row: Doc<'calendars'>, content: Doc<'calendarContents'>) {
  const campus = await ctx.db.get(row.campusId);
  if (!campus) fail('Campus não encontrado.', 404);
  const snapshotId = await ctx.db.insert('calendarSnapshots', {
    state: domainState(row, campus, content.state),
    purpose: row.purpose,
    at: row.updatedAt,
    catalogueRevision: content.catalogueRevision,
    institutionalEvents: content.institutionalSnapshot,
    documentSnapshot: content.documentSnapshot,
  });
  await ctx.db.insert('calendarVersions', {
    calendarId: row._id,
    version: row.version,
    at: row.updatedAt,
    catalogueRevision: content.catalogueRevision,
    snapshotId,
  });
}
async function calendarSummaries(ctx: Context, user: Member, deleted = false) {
  const rows = await calendarQuery(ctx, user, deleted).order('desc').take(100);
  return Promise.all(
    rows
      .filter((row) => !!row.deletedAt === deleted)
      .map(async (row) => {
        const campus = await ctx.db.get(row.campusId);
        if (!campus) fail('Campus não encontrado.', 404);
        return summary(row, campus);
      }),
  );
}
function calendarQuery(
  ctx: Context,
  user: Member,
  deleted: boolean,
  requestedCampus?: Id<'campuses'>,
) {
  if (requestedCampus) assertCampus(user, requestedCampus);
  const campusId = user.role === 'CAMPUS' ? user.campusId! : requestedCampus;
  return campusId
    ? ctx.db.query('calendars').withIndex('by_campusId_and_deletedAt', (q) => {
        const scoped = q.eq('campusId', campusId);
        return deleted ? scoped.gt('deletedAt', 0) : scoped.eq('deletedAt', undefined);
      })
    : ctx.db
        .query('calendars')
        .withIndex('by_deletedAt', (q) =>
          deleted ? q.gt('deletedAt', 0) : q.eq('deletedAt', undefined),
        );
}
function pageBound(numItems: number) {
  if (!Number.isInteger(numItems) || numItems < 1 || numItems > 100)
    fail('Escolha páginas de até 100 registros.');
}

export const bootstrap = query({
  args: { includeCalendars: v.optional(v.boolean()) },
  returns: contracts.bootstrapDto,
  handler: async (ctx, { includeCalendars }) => {
    const { user } = await requireNativeUser(ctx);
    const rows = await ctx.db.query('campuses').withIndex('by_name').take(501);
    if (rows.length > 500) fail('Limite de unidades excedido.');
    const members = user.role === 'ADMIN' ? await ctx.db.query('users').take(1001) : [];
    if (members.length > 1000) fail('Use a consulta paginada de membros.');
    return {
      user: safeMember(user),
      campuses: rows
        .filter((c) => !c.archived && (user.role === 'ADMIN' || c._id === user.campusId))
        .map(({ _id, name, archived }) => ({ id: _id, name, archived })),
      catalogue: await catalogue(ctx),
      calendars: includeCalendars === false ? [] : await calendarSummaries(ctx, user),
      users: members
        .filter((u) => !u.removedAt)
        .map((u) => safeMember({ ...u, id: u._id, campusId: u.campusId ?? null })),
    };
  },
});
export const calendarPage = query({
  args: {
    paginationOpts: paginationOptsValidator,
    deleted: v.optional(v.boolean()),
    campusId: v.optional(v.id('campuses')),
  },
  returns: v.object({
    page: v.array(contracts.summary),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { paginationOpts, deleted, campusId }) => {
    const { user } = await requireNativeUser(ctx);
    pageBound(paginationOpts.numItems);
    const result = await calendarQuery(ctx, user, deleted === true, campusId)
      .order('desc')
      .paginate(paginationOpts);
    const page = await Promise.all(
      result.page.map(async (row) => {
        const campus = await ctx.db.get(row.campusId);
        if (!campus) fail('Campus não encontrado.', 404);
        return summary(row, campus);
      }),
    );
    return { page, isDone: result.isDone, continueCursor: result.continueCursor };
  },
});
export const documentPage = query({
  args: { paginationOpts: paginationOptsValidator, year: v.optional(v.number()) },
  returns: v.object({
    page: v.array(validators.documentMetadata),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { paginationOpts, year }) => {
    const { user } = await requireNativeUser(ctx);
    pageBound(paginationOpts.numItems);
    if (year !== undefined && (!Number.isInteger(year) || year < 1900 || year > 9999))
      fail('Ano inválido.');
    const collection =
      year === undefined
        ? user.role === 'ADMIN'
          ? ctx.db.query('documents')
          : ctx.db.query('documents').withIndex('by_publishedAt', (q) => q.gt('publishedAt', 0))
        : ctx.db
            .query('documents')
            .withIndex('by_year_and_publishedAt', (q) =>
              user.role === 'ADMIN' ? q.eq('year', year) : q.eq('year', year).gt('publishedAt', 0),
            );
    const result = await collection.order('desc').paginate(paginationOpts);
    return {
      page: result.page.map((row) => documentDto(documentValue(row))),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});
export const calendar = query({
  args: idArgs,
  returns: contracts.calendarDto,
  handler: async (ctx, { id }) => fullRecord(ctx, (await requireNativeUser(ctx)).user, id),
});
export const resolveCalendarId = query({
  args: { reference: v.string() },
  returns: v.id('calendars'),
  handler: async (ctx, { reference }) => {
    const { user } = await requireNativeUser(ctx);
    if (!reference || reference.length > 200) fail('Registro não encontrado.', 404);
    const id =
      ctx.db.normalizeId('calendars', reference) ??
      (
        await ctx.db
          .query('calendarAliases')
          .withIndex('by_alias', (q) => q.eq('alias', reference))
          .unique()
      )?.calendarId;
    if (!id) fail('Registro não encontrado.', 404);
    await calendarRow(ctx, user, id);
    return id;
  },
});
export const trash = query({
  args: {},
  returns: v.object({ calendars: v.array(contracts.summary) }),
  handler: async (ctx) => ({
    calendars: await calendarSummaries(ctx, (await requireNativeUser(ctx)).user, true),
  }),
});
export const calendarHistory = query({
  args: { ...idArgs, paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(contracts.versionDto),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { id, paginationOpts }) => {
    pageBound(paginationOpts.numItems);
    const { user } = await requireNativeUser(ctx);
    await calendarRow(ctx, user, id);
    const result = await ctx.db
      .query('calendarVersions')
      .withIndex('by_calendarId_and_version', (q) => q.eq('calendarId', id))
      .order('desc')
      .paginate(paginationOpts);
    return {
      page: result.page.map((r) => ({
        version: r.version,
        at: iso(r.at),
        catalogueRevision: r.catalogueRevision,
      })),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});
export const calendarVersion = query({
  args: { ...idArgs, version: v.number() },
  returns: v.object({ version: v.number(), ...validators.snapshotFields }),
  handler: async (ctx, { id, version }) => {
    const { user } = await requireNativeUser(ctx);
    await calendarRow(ctx, user, id);
    const row = await ctx.db
      .query('calendarVersions')
      .withIndex('by_calendarId_and_version', (q) => q.eq('calendarId', id).eq('version', version))
      .unique();
    const snapshot = row && (await ctx.db.get(row.snapshotId));
    if (!row || !snapshot) fail('Versão histórica não encontrada.', 404);
    const { _id, _creationTime, ...value } = snapshot;
    return { version: row.version, ...value };
  },
});
export const reviewHistory = query({
  args: { ...idArgs, paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(contracts.reviewDto),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { id, paginationOpts }) => {
    const { user } = await requireNativeUser(ctx);
    admin(user);
    pageBound(paginationOpts.numItems);
    await calendarRow(ctx, user, id);
    const review = await reviewRow(ctx, id);
    if (!review) return { page: [], isDone: true, continueCursor: '' };
    const result = await ctx.db
      .query('reviewVersions')
      .withIndex('by_reviewId_and_revision', (q) => q.eq('reviewId', review._id))
      .order('desc')
      .paginate(paginationOpts);
    return {
      page: result.page.map(({ _id, _creationTime, reviewId: _reviewId, ...fields }) => ({
        ...fields,
        updatedAt: iso(fields.updatedAt),
        documentSnapshot: fields.documentSnapshot.map(documentDto),
        officialApproval: false as const,
      })),
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
export const logs = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    entries: v.array(logEntry),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { paginationOpts }) => {
    pageBound(paginationOpts.numItems);
    return readAuditPage(ctx, (await requireNativeUser(ctx)).user, paginationOpts);
  },
});

export const createCampus = mutation({
  args: { name: v.string() },
  returns: contracts.campusDto,
  handler: async (ctx, { name }) => {
    const { user } = await requireNativeUser(ctx);
    admin(user);
    name = text(name, 120);
    const rows = await ctx.db.query('campuses').withIndex('by_name').take(501);
    if (rows.length > 500) fail('Limite de unidades excedido.');
    if (rows.some((r) => r.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR')))
      fail('Unidade já cadastrada.', 409);
    const id = await ctx.db.insert('campuses', { name, archived: false });
    await appendAudit(ctx, user, 'CREATE_CAMPUS', { type: 'campus', id });
    return { id, name, archived: false };
  },
});
export const createCalendar = mutation({
  args: { body: contracts.createInput },
  returns: contracts.calendarDto,
  handler: async (ctx, { body }) => {
    const { user } = await requireNativeUser(ctx);
    const campus = await ctx.db.get(body.campusId);
    if (!campus || campus.archived) fail('Campus inválido.');
    assertCampus(user, campus._id);
    if (
      !body.modalities.length ||
      body.modalities.length > 4 ||
      new Set(body.modalities).size !== body.modalities.length ||
      body.modalities.includes('tecnico')
    )
      fail('Selecione as formas de oferta/níveis do calendário.');
    const state = normalizeCalendar({
      year: body.year,
      campus: campus.name,
      offer: body.modalities[0],
      modalities: body.modalities,
      regime: body.regime,
      weekdays: [],
      weekConfirmed: false,
      weekEvidence: '',
      periods: [],
      events: [],
    }) as validators.DomainState;
    const id = await ctx.db.insert('calendars', {
      campusId: campus._id,
      year: body.year,
      modalities: body.modalities,
      purpose: body.purpose ?? 'definitive',
      courses: text(body.courses, 1000),
      classes: (body.classes ?? '').slice(0, 500),
      shifts: (body.shifts ?? '').slice(0, 200),
      version: 1,
      updatedAt: Date.now(),
    });
    const base = await catalogue(ctx, body.year);
    await ctx.db.insert('calendarContents', {
      calendarId: id,
      state: toContent(state),
      catalogueRevision: base.revision,
      institutionalSnapshot: clean(inheritedEvents(base, body.year, body.modalities, state)),
      documentSnapshot: await currentDocuments(ctx, body.year),
    });
    await appendAudit(
      ctx,
      user,
      'CREATE_CALENDAR',
      { type: 'calendar', id },
      { calendarId: id, campusId: campus._id, version: 1 },
    );
    return fullRecord(ctx, user, id);
  },
});
export const saveCalendar = mutation({
  args: { ...idArgs, body: contracts.saveInput },
  returns: contracts.saveResult,
  handler: async (ctx, { id, body }) => {
    const { user } = await requireNativeUser(ctx);
    const { row, content, record, base, docs } = await baseRecord(ctx, user, id);
    if (row.version !== body.version) fail('Há versão mais recente. Reabra o calendário.', 409);
    if (body.catalogueRevision !== base.revision)
      fail('A base institucional mudou. Reabra para incorporar as alterações.', 409);
    if (
      body.state.year !== row.year ||
      JSON.stringify(body.state.modalities) !== JSON.stringify(row.modalities)
    )
      fail('Ano e ofertas não podem mudar neste registro.');
    const state = normalizeCalendar({
      ...body.state,
      campus: record.state.campus,
    }) as validators.DomainState;
    for (const event of state.events) {
      const source = event.historicalSource;
      if (!source) continue;
      const history = await ctx.db.get(source.historyId);
      const analysis =
        history &&
        (await ctx.db
          .query('historyAnalyses')
          .withIndex('by_historyId', (q) => q.eq('historyId', history._id))
          .unique());
      if (
        !history ||
        history.calendarId !== id ||
        !Number.isInteger(source.page) ||
        source.page < 1 ||
        !analysis?.analysis.pages.some((p) => p.page === source.page) ||
        (source.candidateKey &&
          !analysis.analysis.candidates.some(
            (item) =>
              item.page === source.page && historyCandidateKey(item) === source.candidateKey,
          ))
      )
        fail('Referência histórica inválida para este calendário.');
    }
    try {
      state.periods = recalculatePeriods(state, [
        ...inheritedEvents(base, row.year, row.modalities, state),
        ...state.events,
      ]);
      state.events = recalculateAssessmentStages(state, [
        ...inheritedEvents(base, row.year, row.modalities, state),
        ...state.events,
      ]);
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Não foi possível recalcular o calendário.');
    }
    const next = toContent(state),
      institutionalSnapshot = clean(inheritedEvents(base, row.year, row.modalities, state));
    if (
      equalValues(clean(content.state), next) &&
      content.catalogueRevision === base.revision &&
      equalValues(content.documentSnapshot, docs) &&
      equalValues(content.institutionalSnapshot, institutionalSnapshot)
    )
      return {
        version: row.version,
        state: record.state,
        updatedAt: iso(row.updatedAt),
        unchanged: true,
        readiness: (await baseRecord(ctx, user, id)).readiness,
      };
    await archive(ctx, row, content);
    await ctx.db.patch(content._id, {
      state: next,
      catalogueRevision: base.revision,
      institutionalSnapshot,
      documentSnapshot: docs,
    });
    await ctx.db.patch(id, { version: row.version + 1, updatedAt: Date.now() });
    await appendAudit(
      ctx,
      user,
      'SAVE_CALENDAR',
      { type: 'calendar', id },
      { calendarId: id, campusId: row.campusId, version: row.version + 1 },
    );
    const saved = await baseRecord(ctx, user, id);
    return {
      version: saved.row.version,
      state: saved.record.state,
      updatedAt: saved.record.updatedAt,
      readiness: saved.readiness,
    };
  },
});
export const deleteCalendar = mutation({
  args: { ...idArgs, version: v.number() },
  returns: ok,
  handler: async (ctx, { id, version }) => {
    const { user } = await requireNativeUser(ctx);
    const row = await calendarRow(ctx, user, id);
    if (row.version !== version)
      fail('O calendário foi alterado. Atualize a lista antes de excluir.', 409);
    await ctx.db.patch(id, { deletedAt: Date.now(), deletedBy: user.id });
    await appendAudit(
      ctx,
      user,
      'DELETE_CALENDAR',
      { type: 'calendar', id },
      { calendarId: id, campusId: row.campusId, version: row.version },
    );
    return { ok: true };
  },
});
export const restoreCalendar = mutation({
  args: idArgs,
  returns: ok,
  handler: async (ctx, { id }) => {
    const { user } = await requireNativeUser(ctx);
    const row = await calendarRow(ctx, user, id, true);
    if (!row.deletedAt) fail('Calendário já está ativo.', 409);
    await ctx.db.patch(id, { deletedAt: undefined, deletedBy: undefined });
    await appendAudit(
      ctx,
      user,
      'RESTORE_CALENDAR',
      { type: 'calendar', id },
      { calendarId: id, campusId: row.campusId, version: row.version },
    );
    return { ok: true };
  },
});
export const makeDefinitive = mutation({
  args: { ...idArgs, version: v.number() },
  returns: v.object({
    purpose: validators.purpose,
    version: v.number(),
    updatedAt: v.string(),
    readiness: contracts.readiness,
  }),
  handler: async (ctx, { id, version }) => {
    const { user } = await requireNativeUser(ctx);
    const { row, content } = await baseRecord(ctx, user, id);
    if (row.version !== version)
      fail('Há versão mais recente. Reabra o calendário antes de torná-lo definitivo.', 409);
    if (row.purpose === 'test') {
      await archive(ctx, row, content);
      await ctx.db.patch(id, {
        purpose: 'definitive',
        version: row.version + 1,
        updatedAt: Date.now(),
      });
      await appendAudit(
        ctx,
        user,
        'MAKE_CALENDAR_DEFINITIVE',
        { type: 'calendar', id },
        { calendarId: id, campusId: row.campusId, version: row.version + 1 },
      );
    }
    const saved = await baseRecord(ctx, user, id);
    return {
      purpose: saved.row.purpose,
      version: saved.row.version,
      updatedAt: saved.record.updatedAt,
      readiness: saved.readiness,
    };
  },
});

export const saveCatalogue = mutation({
  args: { body: contracts.catalogueInput },
  returns: ok,
  handler: async (ctx, { body }) => {
    const { user } = await requireNativeUser(ctx);
    admin(user);
    if (body.revision !== (await globalRevision(ctx)))
      fail('Base atualizada por outra sessão. Recarregue.', 409);
    datesBetween(body.start, body.end);
    if (
      body.start.slice(0, 4) !== body.end.slice(0, 4) ||
      !validCategory(body.category) ||
      !body.offers.length
    )
      fail('Datas, efeito ou ofertas inválidos.');
    const prior = body.id
      ? await ctx.db
          .query('institutionalEvents')
          .withIndex('by_code', (q) => q.eq('code', body.id!))
          .unique()
      : null;
    const year = Number(body.start.slice(0, 4)),
      code = body.id ?? crypto.randomUUID();
    text(code, 100);
    const fields = {
      code,
      year,
      name: text(body.name, 160),
      start: body.start,
      end: body.end,
      kind: body.kind,
      category: text(body.category, 40),
      evidence: text(body.evidence),
      modalities: body.offers,
      active: body.active,
    };
    const id = prior ? prior._id : await ctx.db.insert('institutionalEvents', fields);
    if (prior) await ctx.db.replace(prior._id, fields);
    await bumpRevision(ctx, year);
    if (prior && prior.year !== year) await bumpRevision(ctx, prior.year);
    await appendAudit(ctx, user, 'UPDATE_CATALOGUE', { type: 'institutionalEvent', id });
    return { ok: true };
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

export const review = query({
  args: idArgs,
  returns: contracts.reviewSupportDto,
  handler: async (ctx, { id }) => {
    const { user } = await requireNativeUser(ctx);
    admin(user);
    const { record, base, review: prior } = await baseRecord(ctx, user, id);
    const support = reviewSupport(record, [
      ...inheritedEvents(base, record.state.year, record.state.modalities, record.state),
      ...record.state.events,
    ]);
    return clean({
      ...support,
      initialConclusion: initialConclusion(support),
      catalogueRevision: base.revision,
      review: prior ? reviewDto(prior) : null,
      stale:
        !!prior &&
        (prior.calendarVersion !== record.version || prior.catalogueRevision !== base.revision),
    }) as Infer<typeof contracts.reviewSupportDto>;
  },
});
export const saveReview = mutation({
  args: { ...idArgs, body: contracts.reviewInput },
  returns: v.object({ revision: v.number() }),
  handler: async (ctx, { id, body }) => {
    const { user } = await requireNativeUser(ctx);
    admin(user);
    const { record, base, docs, review: prior } = await baseRecord(ctx, user, id);
    if (body.calendarVersion !== record.version || body.catalogueRevision !== base.revision)
      fail('O calendário ou a base mudou. Reabra a revisão.', 409);
    if (body.revision !== (prior?.revision ?? 0))
      fail('Outro revisor atualizou esta análise. Reabra antes de salvar.', 409);
    if (
      prior &&
      (prior.calendarVersion !== record.version || prior.catalogueRevision !== base.revision) &&
      !body.acknowledgeStale
    )
      fail('Confirme a reavaliação das conclusões anteriores após a mudança de versão.', 409);
    if (
      body.entries.length !== reviewCriteria.length ||
      new Set(body.entries.map((e) => e.id)).size !== reviewCriteria.length
    )
      fail('Confira todos os critérios da revisão.');
    for (const e of body.entries) {
      if (!reviewCriteria.some((c) => c.id === e.id) || e.notes.length > 2000)
        fail('Critério ou observação inválidos.');
      if (e.status === 'PENDENTE' && e.reviewed)
        fail('Selecione Atendido, Não atendido ou Não aplicável antes de confirmar a análise.');
    }
    const support = reviewSupport(record, [
      ...inheritedEvents(base, record.state.year, record.state.modalities, record.state),
      ...record.state.events,
    ]);
    const conclusion = updateConclusion(
      presentReviewText(body.conclusion, record.state.year),
      reviewCriteria,
      body.entries,
      reviewNorm(record.state.year, support.sameYear ? support.source.norm : ''),
    );
    if (
      conclusion.length > 8000 ||
      (body.processNumber ?? '').length > 100 ||
      (body.applicableNorm ?? '').length > 1000
    )
      fail('Síntese ou identificação muito longa.');
    const next = {
      calendarId: id,
      calendarVersion: record.version,
      catalogueRevision: base.revision,
      revision: (prior?.revision ?? 0) + 1,
      source: 'SEI 3959640',
      documentSnapshot: docs,
      entries: body.entries,
      conclusion,
      processNumber: body.processNumber ?? '',
      applicableNorm:
        presentReviewText(body.applicableNorm, record.state.year) || reviewNorm(record.state.year),
      reviewer: { id: user.id, name: user.name },
      updatedAt: Date.now(),
    };
    if (prior) {
      const { _id, _creationTime: _creation, ...fields } = prior;
      await ctx.db.insert('reviewVersions', { reviewId: _id, ...fields });
      await ctx.db.replace(_id, next);
    } else await ctx.db.insert('reviews', next);
    await appendAudit(
      ctx,
      user,
      'SAVE_HUMAN_REVIEW',
      { type: 'calendar', id },
      { calendarId: id, campusId: record.campusId, version: record.version },
    );
    return { revision: next.revision };
  },
});
export const exportReview = query({
  args: { ...idArgs, revision: v.number() },
  returns: contracts.exportDto,
  handler: async (ctx, { id, revision }) => {
    const { user } = await requireNativeUser(ctx);
    admin(user);
    const { record, base, review: prior } = await baseRecord(ctx, user, id);
    if (!prior) fail('Salve a análise inicial ou a revisão antes de exportar.', 409);
    if (
      prior.revision !== revision ||
      prior.calendarVersion !== record.version ||
      prior.catalogueRevision !== base.revision
    )
      fail('A análise está desatualizada. Reabra, confira e salve antes de exportar.', 409);
    return reviewDocument(record, reviewDto(prior)) as Infer<typeof contracts.exportDto>;
  },
});

async function ownedHistory(ctx: Context, user: Member, id: Id<'histories'>) {
  const history = await ctx.db.get(id);
  if (!history) fail('Registro não encontrado.', 404);
  await calendarRow(ctx, user, history.calendarId);
  assertCampus(user, history.campusId);
  return history;
}
export const pdfContext = internalQuery({
  args: validators.pdfRequest.fields,
  returns: v.object({
    record: contracts.calendarDto,
    proposalCopy: v.boolean(),
    readiness: contracts.readiness,
    currentCatalogueRevision: v.number(),
  }),
  handler: async (ctx, { id, version, catalogueRevision, copy }) => {
    const { user } = await requireNativeUser(ctx);
    const record = await fullRecord(ctx, user, id);
    if (
      record.version !== version ||
      record.currentCatalogueRevision !== catalogueRevision ||
      record.catalogueRevision !== catalogueRevision
    )
      fail('Salve a versão atual com a base institucional atualizada antes de baixar.', 409);
    const proposalCopy = copy === true && record.purpose !== 'test';
    if (record.purpose !== 'test' && !record.readiness.ready && !proposalCopy)
      fail('Geração definitiva bloqueada. ' + record.readiness.issues.join('\n'), 409);
    return {
      record,
      proposalCopy,
      readiness: record.readiness,
      currentCatalogueRevision: record.currentCatalogueRevision,
    };
  },
});
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
export const documentContext = internalQuery({
  args: { id: v.id('documents') },
  returns: v.object({ document: validators.documentMetadata }),
  handler: async (ctx, { id }) => {
    const { user } = await requireNativeUser(ctx);
    const row = await ctx.db.get(id);
    if (!row || (user.role !== 'ADMIN' && !row.publishedAt)) fail('Documento não encontrado.', 404);
    return { document: documentDto(documentValue(row)) };
  },
});
async function consumeUpload(
  ctx: MutationCtx,
  userId: Id<'users'>,
  uploadId: string,
  filename: string,
) {
  const upload = await ctx.db
    .query('nativeUploads')
    .withIndex('by_uploadId', (q) => q.eq('uploadId', uploadId))
    .unique();
  if (
    !upload ||
    upload.ownerId !== userId ||
    upload.expiresAt <= Date.now() ||
    !upload.completedAt ||
    upload.consumedAt ||
    !upload.storageId ||
    !upload.hash ||
    upload.filename !== filename
  )
    fail('Envio expirado, já utilizado ou incompatível.', 409);
  if (!filename.toLowerCase().endsWith('.pdf')) fail('Envie um PDF.');
  const [history, document] = await Promise.all([
    ctx.db
      .query('histories')
      .withIndex('by_storageId', (q) => q.eq('storageId', upload.storageId))
      .first(),
    ctx.db
      .query('documents')
      .withIndex('by_storageId', (q) => q.eq('storageId', upload.storageId))
      .first(),
  ]);
  if (history || document) fail('Arquivo já cadastrado.', 409);
  await ctx.db.patch(upload._id, { consumedAt: Date.now() });
  return {
    storageId: upload.storageId,
    hash: upload.hash,
    filename: text(filename, 180),
    size: upload.size,
  };
}
export const attachHistory = internalMutation({
  args: validators.historyUploadInput.fields,
  returns: v.object({ id: v.id('histories') }),
  handler: async (ctx, { calendarId, uploadId, filename, year, notes }) => {
    const { user, row: member } = await requireNativeUser(ctx);
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
export const saveHistoryAnalysis = internalMutation({
  args: { id: v.id('histories'), hash: v.string(), analysis: validators.historyAnalysis },
  returns: validators.historyAnalysis,
  handler: async (ctx, { id, hash, analysis }) => {
    const { user } = await requireNativeUser(ctx);
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
