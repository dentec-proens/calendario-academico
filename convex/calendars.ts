import { prepareOfferCalendarSave } from '../src/domain/calendar/prepare-save';
import {
  offerCalendarContent,
  normalizeOfferCalendar,
} from '../src/domain/calendar/normalization/normalize-v4';
import { kinds, nextOfferId, offerFor, stageTerm } from '../src/domain/calendar/offers';
import type { CalendarOffer, ActivityState, CalendarActivity } from '../src/domain/calendar/model';
import { assessmentCycleIssue } from '../src/domain/calendar/activities/assessment-intervals';
import { isStageRequirementId } from '../src/domain/calendar/activities/metadata';
import { periodsForOffer } from '../src/domain/calendar/organization/periods';
import { equalValues } from '../src/shared/equal';
import { DomainError } from '../src/domain/errors';
import { inspectBase, reconcileBase } from './calendars/base';
import { assertWritesOpen } from './lib/maintenance';
import { equivalentRulesets, rulesetVersion } from '../src/domain/policies/registry';
import { inheritedEvents } from '../src/domain/institution/catalogue';
import { query, mutation } from './_generated/server';
import { requireNativeUser } from './access/identity';
import { calendarRow, summary } from './calendars/model';
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
import { domainRule, fail, iso, text, clean } from './lib/shared';
import * as validators from './validators';
import { paginationOptsValidator } from 'convex/server';
import { v, type Infer } from 'convex/values';

const idArgs = { id: v.id('calendars') };
const ok = v.object({ ok: v.boolean() });

/** Preserve inconsistent migrated evidence, but validate every new interval or changed cycle. */
function validateEditedAssessmentCycles(previous: ActivityState, next: ActivityState) {
  const cycle = (state: ActivityState, event: CalendarActivity) => {
    const [stage, id] = event.requirementId!.split(':');
    const offer = offerFor(state, id);
    const term = offer && stageTerm(offer, Number(stage.slice('stage-'.length)));
    return {
      organization: offer?.organization,
      perTerm: offer?.stages?.perTerm,
      periods: periodsForOffer(state, id)
        .filter(
          (period) => period.association?.status === 'defined' && period.association.term === term,
        )
        .map(({ id, start, end }) => ({ id, start, end })),
    };
  };
  for (const event of next.events) {
    if (!isStageRequirementId(event.requirementId)) continue;
    const old = previous.events.find((item) => item.id === event.id);
    const unchanged =
      old &&
      old.requirementId === event.requirementId &&
      old.start === event.start &&
      old.end === event.end &&
      equalValues(old.offers, event.offers) &&
      equalValues(cycle(previous, old), cycle(next, event));
    if (unchanged) continue;
    const issue = assessmentCycleIssue(next, event);
    if (issue) throw new DomainError(issue);
  }
}

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
    const id = ctx.db.normalizeId('calendars', reference);
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
    return {
      version: row.version,
      ...value,
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
    const offers: CalendarOffer[] = [];
    for (const offer of body.offers)
      offers.push({
        ...offer,
        id: nextOfferId({ offers, periods: [], events: [] }, offer.kind),
        delivery: 'presencial',
      });
    const state = domainRule(() =>
      normalizeOfferCalendar({
        schemaVersion: 4,
        year: body.year,
        campus: campus.name,
        offers,
        weekdays: [],
        weekConfirmed: false,
        periods: [],
        events: [],
      }),
    ) as validators.DomainState;
    const id = await ctx.db.insert('calendars', {
      campusId: campus._id,
      year: body.year,
      offerKinds: kinds(state),
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
      state: offerCalendarContent(state) as validators.ContentState,
      catalogueRevision: base.revision,
      institutionalSnapshot: clean(inheritedEvents(base, body.year, state.offers, state)),
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
    if (
      !equivalentRulesets(
        body.state.rulesetVersion,
        rulesetVersion({ year: row.year, offers: body.state.offers }),
      )
    )
      fail(
        'O conjunto de regras mudou. Atualize a aplicação e confira o preenchimento antes de salvar.',
        409,
      );
    const reconciliation = reconcileBase(compatibility, body.baseAcceptance);
    const savedContent = clean(content.state);
    const proposedState = { ...body.state, teacherDayDate: body.state.teacherDayDate ?? undefined };
    const prepared = domainRule(() => {
      const prepared = prepareOfferCalendarSave(record.state, proposedState, {
        storedContent: savedContent,
        catalogue: base,
        recalculate: reconciliation.recalculate,
      });
      validateEditedAssessmentCycles(record.state, prepared.state);
      return prepared;
    });
    // Convex validators constrain the transport; domain normalization preserves those literals.
    const state = prepared.state as validators.DomainState;
    const next = prepared.content as validators.ContentState;
    const institutionalSnapshot = clean(prepared.institutionalSnapshot);
    if (prepared.unchanged && !reconciliation.incorporate) {
      if (!equalValues(row.offerKinds, prepared.offerKinds))
        await ctx.db.patch(id, { offerKinds: prepared.offerKinds });
      if (content.catalogueRevision !== base.revision)
        await ctx.db.patch(content._id, { catalogueRevision: base.revision });
      return {
        base: inspectBase(state, content, base, docs).dto,
        version: row.version,
        state: record.state,
        updatedAt: iso(row.updatedAt),
        unchanged: true,
        readiness: (await baseRecord(ctx, user, id)).readiness,
      };
    }
    await archive(ctx, row, content);
    await ctx.db.patch(content._id, {
      state: next,
      catalogueRevision: base.revision,
      institutionalSnapshot,
      documentSnapshot: docs,
    });
    await ctx.db.patch(id, {
      offerKinds: kinds(state),
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
      state: saved.record.state,
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
    if (content.catalogueRevision !== compatibility.snapshot.revision)
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
    await ctx.db.patch(id, {
      deletedAt: Date.now(),
      deletedBy: user.id,
      offerKinds: row.offerKinds,
    });
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
    await ctx.db.patch(id, {
      deletedAt: undefined,
      deletedBy: undefined,
      offerKinds: row.offerKinds,
    });
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
        offerKinds: row.offerKinds,
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
