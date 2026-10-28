import { withoutManualSources } from '../src/manual-sources';
import { legacyCalendarState } from './calendars/legacyDto';
import { validateAddedOffers } from '../src/offer-organization';
import { modalityIds } from '../src/calendar-config';
import { inspectBase, reconcileBase } from './calendars/base';
import { assertWritesOpen, maintenanceAccess } from './lib/maintenance';
import { normalizeCalendar } from '../src/calendar-normalize';
import { recalculateCalendar } from '../src/calendar-edits/commands';
import { equalValues } from '../src/equal';
import { rulesetVersion } from '../src/calendar-rules/index';
import { inheritedEvents } from '../src/institution';
import { query, mutation, internalQuery } from './_generated/server';
import { requireNativeUser } from './access/identity';
import { calendarRow, summary, toContent } from './calendars/model';
import {
  fullRecord,
  calendarSummaries,
  calendarQuery,
  baseRecord,
  archive,
} from './calendars/record';
import { catalogue } from './catalogue/model';
import * as contracts from './contracts';
import { currentDocuments } from './documents/model';
import { appendAudit } from './lib/audit';
import { calendarEditor, assertCampus } from './lib/authorization';
import { pageBound } from './lib/pagination';
import { fail, iso, text, clean } from './lib/shared';
import * as validators from './validators';
import { paginationOptsValidator } from 'convex/server';
import { v, type Infer } from 'convex/values';

const idArgs = { id: v.id('calendars') };
const ok = v.object({ ok: v.boolean() });

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
        return summary(ctx, row, campus);
      }),
    );
    return { page, isDone: result.isDone, continueCursor: result.continueCursor };
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
  returns: v.object({ version: v.number(), ...validators.snapshotDtoFields }),
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
    return {
      version: row.version,
      ...value,
      state: legacyCalendarState(value.state, id, row.version),
    };
  },
});

export const createCalendar = mutation({
  args: { body: contracts.createInput },
  returns: contracts.calendarDto,
  handler: async (ctx, { body }) => {
    await assertWritesOpen(ctx);
    const { user } = await requireNativeUser(ctx);
    calendarEditor(user);
    const campus = await ctx.db.get(body.campusId);
    if (!campus || campus.archived) fail('Campus inválido.');
    assertCampus(user, campus._id);
    if (
      !body.modalities.length ||
      body.modalities.length > modalityIds.length ||
      new Set(body.modalities).size !== body.modalities.length
    )
      fail('Selecione as formas de oferta/níveis do calendário.');
    const state = normalizeCalendar({
      schemaVersion: 3,
      assessmentStagesByModality: {},
      year: body.year,
      campus: campus.name,
      offer: body.modalities[0],
      modalities: body.modalities,
      regime: body.regime,
      organizationByModality: Object.fromEntries(
        body.modalities.map((modality) => [
          modality,
          body.regime === 'anual' || body.regime === 'semestral' ? body.regime : 'a-classificar',
        ]),
      ),
      weekdays: [],
      weekConfirmed: false,
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
  handler: async (ctx, { id, body }): Promise<Infer<typeof contracts.saveResult>> => {
    await assertWritesOpen(ctx);
    const { user } = await requireNativeUser(ctx);
    calendarEditor(user);
    const { row, content, record, base, docs, compatibility } = await baseRecord(ctx, user, id);
    if (row.version !== body.version) fail('Há versão mais recente. Reabra o calendário.', 409);
    if (content.state.schemaVersion === 3 && body.state.schemaVersion !== 3)
      fail(
        'Este calendário usa o formato v3. Atualize a aplicação; o preenchimento não foi gravado nem descartado.',
        409,
      );
    if (
      body.state.schemaVersion === 3 &&
      body.state.rulesetVersion !==
        rulesetVersion({ year: row.year, modalities: body.state.modalities })
    )
      fail(
        'O conjunto de regras mudou. Atualize a aplicação e confira o preenchimento antes de salvar.',
        409,
      );
    const reconciliation = reconcileBase(compatibility, body.baseAcceptance);
    // Legacy slots do not turn an unchanged read/smoke into a content edit. The
    // separately verified administrative plan removes existing stored values.
    const savedLogical = clean(withoutManualSources(content.state).state);
    if (body.state.year !== row.year) fail('O ano não pode mudar neste registro.');
    if (row.modalities.some((modality) => !body.state.modalities.includes(modality)))
      fail('Ofertas existentes não podem ser removidas por esta operação.');
    const added = body.state.modalities.some((modality) => !row.modalities.includes(modality));
    const state = normalizeCalendar({
      ...body.state,
      events: added
        ? body.state.events.map((event) =>
            !event.modalities?.length &&
            record.state.events.some(
              (previous) => previous.id === event.id && !previous.modalities?.length,
            )
              ? { ...event, modalities: [...row.modalities] }
              : event,
          )
        : body.state.events,
      campus: record.state.campus,
    }) as validators.DomainState;
    try {
      validateAddedOffers(row.modalities, state);
      if (reconciliation.recalculate || !equalValues(savedLogical, toContent(state))) {
        Object.assign(
          state,
          normalizeCalendar(
            recalculateCalendar(state, inheritedEvents(base, row.year, state.modalities, state)),
          ),
        );
      }
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Não foi possível recalcular o calendário.');
    }
    const next = toContent(state),
      institutionalSnapshot = clean(inheritedEvents(base, row.year, state.modalities, state));
    if (equalValues(savedLogical, next) && !reconciliation.incorporate) {
      if (!body.unchangedOnly && content.catalogueRevision !== base.revision)
        await ctx.db.patch(content._id, { catalogueRevision: base.revision });
      return {
        base: inspectBase(state, content, base, docs).dto,
        version: row.version,
        state: legacyCalendarState(record.state, record.id, record.version),
        updatedAt: iso(row.updatedAt),
        unchanged: true,
        readiness: (await baseRecord(ctx, user, id)).readiness,
      };
    }
    if (body.unchangedOnly)
      fail(
        'O smoke exige um calendário de teste já salvo com a base atual. Nenhuma alteração foi gravada.',
        409,
      );
    await archive(ctx, row, content);
    await ctx.db.patch(content._id, {
      state: next,
      catalogueRevision: base.revision,
      institutionalSnapshot,
      documentSnapshot: docs,
    });
    await ctx.db.patch(id, {
      modalities: state.modalities,
      version: row.version + 1,
      updatedAt: Date.now(),
    });
    await appendAudit(
      ctx,
      user,
      'SAVE_CALENDAR',
      { type: 'calendar', id },
      { calendarId: id, campusId: row.campusId, version: row.version + 1 },
    );
    const saved = await baseRecord(ctx, user, id);
    return {
      base: saved.compatibility.dto,
      version: saved.row.version,
      state: legacyCalendarState(saved.record.state, saved.record.id, saved.record.version),
      updatedAt: saved.record.updatedAt,
      readiness: saved.readiness,
    };
  },
});

export const synchronizeBase = mutation({
  args: { ...idArgs, version: v.number() },
  returns: contracts.calendarDto,
  handler: async (ctx, { id, version }) => {
    await assertWritesOpen(ctx);
    const { user } = await requireNativeUser(ctx);
    calendarEditor(user);
    const { row, content, compatibility } = await baseRecord(ctx, user, id);
    if (row.version !== version) fail('Há versão mais recente. Reabra o calendário.', 409);
    reconcileBase(compatibility);
    if (
      content.catalogueRevision !== compatibility.snapshot.revision &&
      !(await maintenanceAccess(ctx))
    )
      await ctx.db.patch(content._id, { catalogueRevision: compatibility.snapshot.revision });
    return fullRecord(ctx, user, id);
  },
});

export const deleteCalendar = mutation({
  args: { ...idArgs, version: v.number() },
  returns: ok,
  handler: async (ctx, { id, version }) => {
    await assertWritesOpen(ctx);
    const { user } = await requireNativeUser(ctx);
    calendarEditor(user);
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
    await assertWritesOpen(ctx);
    const { user } = await requireNativeUser(ctx);
    calendarEditor(user);
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
    await assertWritesOpen(ctx);
    const { user } = await requireNativeUser(ctx);
    calendarEditor(user);
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

export const pdfContext = internalQuery({
  args: validators.pdfRequest.fields,
  returns: v.object({
    record: contracts.calendarDto,
    proposalCopy: v.boolean(),
    readiness: contracts.readiness,
    currentCatalogueRevision: v.number(),
  }),
  handler: async (ctx, { id, version, copy }) => {
    const { user } = await requireNativeUser(ctx);
    const record = await fullRecord(ctx, user, id);
    const { compatibility } = await baseRecord(ctx, user, id);
    if (record.version !== version || !compatibility.compatible)
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
