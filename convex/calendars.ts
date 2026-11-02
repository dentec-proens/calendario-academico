import { readCalendarOfferInput } from '../src/domain/calendar/normalization/input-v4.ts';
import { prepareOfferCalendarSave } from '../src/domain/calendar/prepare-save';
import {
  offerCalendarContent,
  normalizeOfferCalendar,
} from '../src/domain/calendar/normalization/normalize-v4';
import { kinds, nextOfferId } from '../src/domain/calendar/offers';
import { calendarSchemaVersion, type CalendarOffer } from '../src/domain/calendar/model';
import { equalValues } from '../src/shared/equal';
import { inspectBase, reconcileBase } from './calendars/base';
import { assertWritesOpen } from './lib/maintenance';
import { equivalentRulesets, rulesetVersion } from '../src/domain/policies/registry';
import { inheritedEvents } from '../src/domain/institution/catalogue';
import { applyObservances } from '../src/domain/calendar/observances';
import { query, mutation } from './_generated/server';
import { requireNativeUser } from './access/identity';
import { calendarRow, campusName, contents, summary } from './calendars/model';
import { applyTransition } from './calendars/transitions';
import { calendarName } from '../src/domain/calendar/label';
import { normalizeIdentity } from '../src/domain/calendar/identity';
import type { Member } from './access/contracts';
import { fullRecord, calendarSummaries, calendarQuery, baseRecord } from './calendars/record';
import {
  assertUniqueInFlow,
  decisionsFor,
  lifecycleRole,
  lineage,
  overlapping,
} from './calendars/lifecycle';
import {
  canCreateVersion,
  isDeletable,
  isEditable,
  statusLabels,
} from '../src/domain/calendar/lifecycle';
import { catalogue } from './catalogue/model';
import * as contracts from './contracts';
import { currentDocuments, documentDto } from './documents/model';
import { appendAudit } from './lib/audit';
import { calendarEditor, assertCampus, reviewer } from './lib/authorization';
import { pageBound } from './lib/pagination';
import { domainRule, fail, iso, clean } from './lib/shared';
import type { Doc } from './_generated/dataModel';
import * as validators from './validators';
import { paginationOptsValidator } from 'convex/server';
import { v, type Infer } from 'convex/values';

const idArgs = { id: v.id('calendars') };
const ok = v.object({ ok: v.boolean() });

/** Autosave, base synchronization and offer corrections never write to a locked calendar. */
function assertEditableStatus(status: Doc<'calendars'>['status']) {
  if (!isEditable(status))
    fail(
      `O calendário está ${statusLabels[status].toLowerCase()} e não pode ser alterado. ${status === 'enviado' ? 'Recolha o envio para editar.' : status === 'vigente' ? 'Crie uma nova versão para alterá-lo.' : status === 'arquivado' ? 'Um calendário arquivado fica apenas para consulta.' : 'Aguarde a devolução para editar.'}`,
      409,
    );
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
        schemaVersion: calendarSchemaVersion,
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
      status: 'rascunho',
      statusRevision: 0,
      // Identity is filled in the editor; courses are required only to submit.
      courses: '',
      classes: '',
      shifts: '',
      version: 1,
      updatedAt: Date.now(),
    });
    const base = await catalogue(ctx, body.year);
    await ctx.db.insert('calendarContents', {
      calendarId: id,
      state: offerCalendarContent(state) as validators.ContentState,
      catalogueRevision: base.revision,
      institutionalSnapshot: clean(
        applyObservances(inheritedEvents(base, body.year, state.offers), state),
      ),
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
    const { row, status, content, record, base, docs, compatibility } = await baseRecord(
      ctx,
      user,
      id,
    );
    if (row.version !== body.version) fail('Há versão mais recente. Reabra o calendário.', 409);
    assertEditableStatus(status);
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
    // Offers cannot be removed: an overlap born here between transitions could not be undone.
    const proposedKinds = kinds(body.state);
    if (status === 'devolvido' && proposedKinds.some((kind) => !row.offerKinds.includes(kind)))
      await assertUniqueInFlow(ctx, row, proposedKinds);
    const reconciliation = reconcileBase(compatibility, body.baseAcceptance);
    const savedContent = clean(content.state);
    const proposedState = domainRule(() => readCalendarOfferInput(body.state));
    const prepared = domainRule(() =>
      prepareOfferCalendarSave(record.state, proposedState, {
        storedContent: savedContent,
        catalogue: base,
        recalculate: reconciliation.recalculate,
      }),
    );
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
    const { row, status, content, compatibility } = await baseRecord(ctx, user, id);
    if (row.version !== version) fail('Há versão mais recente. Reabra o calendário.', 409);
    assertEditableStatus(status);
    reconcileBase(compatibility);
    if (content.catalogueRevision !== compatibility.snapshot.revision)
      await ctx.db.patch(content._id, { catalogueRevision: compatibility.snapshot.revision });
    return fullRecord(ctx, user, id);
  },
});

/**
 * Courses, classes, shifts and label describe the calendar without being part of its content:
 * they keep the content version, so an open editor never sees this change as a conflict.
 * `expected` is the identity the form started from, so a change from another session is
 * reported instead of overwritten.
 */
export const updateCalendarIdentity = mutation({
  args: { ...idArgs, expected: contracts.identityInput, body: contracts.identityInput },
  returns: ok,
  handler: async (ctx, { id, expected, body }) => {
    await assertWritesOpen(ctx);
    const { user } = await requireNativeUser(ctx);
    calendarEditor(user);
    const row = await calendarRow(ctx, user, id);
    assertEditableStatus(row.status);
    const next = domainRule(() => normalizeIdentity(body));
    const stored = domainRule(() =>
      normalizeIdentity({
        courses: row.courses,
        classes: row.classes,
        shifts: row.shifts,
        label: row.label ?? '',
      }),
    );
    if (equalValues(next, stored)) return { ok: true };
    if (
      !equalValues(
        domainRule(() => normalizeIdentity(expected)),
        stored,
      )
    )
      fail(
        'A identificação foi alterada em outra sessão. Descarte as alterações para ver os valores atuais e edite novamente.',
        409,
      );
    // An empty label is stored as an absent field, so the name falls back to campus and year.
    const { label, ...fields } = next;
    await ctx.db.patch(id, { ...fields, label: label || undefined, updatedAt: Date.now() });
    await appendAudit(
      ctx,
      user,
      'UPDATE_CALENDAR_IDENTITY',
      { type: 'calendar', id },
      { calendarId: id, campusId: row.campusId, version: row.version },
    );
    return { ok: true };
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
    const status = row.status;
    if (!isDeletable(status))
      fail(
        `Um calendário ${statusLabels[status].toLowerCase()} não pode ir para a lixeira. Somente rascunhos e calendários devolvidos podem ser excluídos.`,
        409,
      );
    // A deleted returned calendar becomes a draft and frees its in-flow place; submissions stay.
    await ctx.db.patch(id, {
      deletedAt: Date.now(),
      deletedBy: user.id,
      offerKinds: row.offerKinds,
      ...(status === 'devolvido'
        ? {
            status: 'rascunho' as const,
            statusRevision: row.statusRevision + 1,
            currentSubmissionId: undefined,
          }
        : {}),
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
  args: { ...idArgs, version: v.number() },
  returns: ok,
  handler: async (ctx, { id, version }) => {
    await assertWritesOpen(ctx);
    const { user } = await requireNativeUser(ctx);
    calendarEditor(user);
    const row = await calendarRow(ctx, user, id, true);
    if (!row.deletedAt) fail('Calendário já está ativo.', 409);
    if (row.version !== version)
      fail('O calendário foi alterado. Atualize a lixeira antes de restaurar.', 409);
    // Always a draft, which takes no in-flow place, even for a row not deleted by this app.
    await ctx.db.patch(id, {
      deletedAt: undefined,
      deletedBy: undefined,
      offerKinds: row.offerKinds,
      ...(row.status === 'rascunho'
        ? {}
        : {
            status: 'rascunho' as const,
            statusRevision: row.statusRevision + 1,
            currentSubmissionId: undefined,
          }),
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

export const transitionCalendar = mutation({
  args: {
    ...idArgs,
    from: validators.calendarStatus,
    statusRevision: v.number(),
    action: validators.lifecycleAction,
    version: v.optional(v.number()),
    note: v.optional(v.string()),
    sei: v.optional(v.string()),
    partial: v.optional(v.boolean()),
  },
  returns: v.object({ status: validators.calendarStatus, statusRevision: v.number() }),
  handler: async (ctx, args) => {
    await assertWritesOpen(ctx);
    const { user } = await requireNativeUser(ctx);
    // The review starts only with the first saved review of the submission.
    if (args.action === 'startReview')
      fail('A revisão começa ao salvar o parecer deste envio.', 409);
    return applyTransition(ctx, user, args);
  },
});

/** A published calendar is never edited in place: its next version starts as a new draft. */
export const createCalendarVersion = mutation({
  args: idArgs,
  returns: contracts.calendarDto,
  handler: async (ctx, { id }) => {
    await assertWritesOpen(ctx);
    const { user } = await requireNativeUser(ctx);
    calendarEditor(user);
    const row = await calendarRow(ctx, user, id);
    if (!canCreateVersion(row.status, lifecycleRole(user)))
      fail('Somente um calendário vigente pode originar uma nova versão.', 409);
    const content = await contents(ctx, id);
    const copy = await ctx.db.insert('calendars', {
      campusId: row.campusId,
      year: row.year,
      offerKinds: row.offerKinds,
      status: 'rascunho',
      statusRevision: 0,
      ...(row.label ? { label: row.label } : {}),
      derivedFrom: row._id,
      courses: row.courses,
      classes: row.classes,
      shifts: row.shifts,
      version: 1,
      updatedAt: Date.now(),
    });
    // The review belongs to the published calendar and is not copied.
    await ctx.db.insert('calendarContents', {
      calendarId: copy,
      state: content.state,
      catalogueRevision: content.catalogueRevision,
      institutionalSnapshot: content.institutionalSnapshot,
      documentSnapshot: content.documentSnapshot,
    });
    await appendAudit(
      ctx,
      user,
      'CREATE_CALENDAR_VERSION',
      { type: 'calendar', id: copy },
      { calendarId: copy, campusId: row.campusId, version: 1, details: `Derivado de ${row._id}` },
    );
    return fullRecord(ctx, user, copy);
  },
});

function submissionItem(user: Member, row: Doc<'calendarSubmissions'>) {
  return {
    id: row._id,
    calendarId: row.calendarId,
    sequence: row.sequence,
    submittedAt: iso(row.submittedAt),
    submittedBy: row.submittedBy.name,
    submittedFrom: row.submittedFrom,
    ...(row.previousSubmissionId ? { previousSubmissionId: row.previousSubmissionId } : {}),
    contentVersion: row.contentVersion,
    decisions: decisionsFor(user, row.decisions).map((decision) => ({
      ...decision,
      at: iso(decision.at),
    })),
  };
}

/**
 * The submissions of a calendar, metadata only, and the default comparison bases: the last
 * returned submission on a resubmission, or the published submissions of the calendars that a
 * first submission of a new version would replace, when they share its `derivedFrom` chain.
 */
export const calendarSubmissions = query({
  args: { ...idArgs, paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(contracts.submissionListItem),
    isDone: v.boolean(),
    continueCursor: v.string(),
    defaultBases: v.array(v.id('calendarSubmissions')),
    related: v.array(
      v.object({
        submissionId: v.id('calendarSubmissions'),
        calendarId: v.id('calendars'),
        name: v.string(),
      }),
    ),
  }),
  handler: async (ctx, { id, paginationOpts }) => {
    const { user } = await requireNativeUser(ctx);
    pageBound(paginationOpts.numItems);
    const row = await calendarRow(ctx, user, id);
    const result = await ctx.db
      .query('calendarSubmissions')
      .withIndex('by_calendarId_and_sequence', (q) => q.eq('calendarId', id))
      .order('desc')
      .paginate(paginationOpts);
    const chain = await lineage(ctx, row);
    const campus = await campusName(ctx, row);
    const related = chain
      .slice(1)
      .filter((ancestor) => ancestor.publishedSubmissionId)
      .map((ancestor) => ({
        submissionId: ancestor.publishedSubmissionId!,
        calendarId: ancestor._id,
        name: calendarName(ancestor.year, campus, ancestor.label),
      }));
    const current = row.currentSubmissionId ? await ctx.db.get(row.currentSubmissionId) : null;
    let defaultBases: Doc<'calendarSubmissions'>['_id'][] = [];
    if (row.status === 'devolvido' && current) defaultBases = [current._id];
    else if (current?.previousSubmissionId) defaultBases = [current.previousSubmissionId];
    else if (current) {
      const ancestors = new Set(chain.slice(1).map((ancestor) => ancestor._id));
      const replaced = await overlapping(ctx, row, ['vigente']);
      defaultBases = replaced
        .filter((other) => ancestors.has(other._id) && other.publishedSubmissionId)
        .map((other) => other.publishedSubmissionId!);
    }
    return {
      page: result.page.map((submission) => submissionItem(user, submission)),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      defaultBases,
      related,
    };
  },
});

/** The copy of one submission, for the comparison computed in the browser. */
export const submissionContent = query({
  args: { ...idArgs, submissionId: v.id('calendarSubmissions') },
  returns: contracts.submissionContentDto,
  handler: async (ctx, { id, submissionId }) => {
    const { user } = await requireNativeUser(ctx);
    const row = await calendarRow(ctx, user, id);
    const submission = await ctx.db.get(submissionId);
    // Identifiers alone never reach another calendar's or campus's submissions.
    const chain = new Set((await lineage(ctx, row)).map((item) => item._id));
    if (!submission || !chain.has(submission.calendarId)) fail('Envio não encontrado.', 404);
    const owner = await ctx.db.get(submission.calendarId);
    if (!owner) fail('Envio não encontrado.', 404);
    return clean({
      ...submissionItem(user, submission),
      state: { ...submission.state, year: owner.year, campus: submission.campusName },
      catalogueRevision: submission.catalogueRevision,
      institutionalSnapshot: submission.institutionalSnapshot,
      documentSnapshot: submission.documentSnapshot.map(documentDto),
      offerKinds: submission.offerKinds,
    });
  },
});

/** What a publication would replace, for the administration to confirm before publishing. */
export const replacementPreview = query({
  args: idArgs,
  returns: v.object({
    replaced: v.array(
      v.object({
        id: v.id('calendars'),
        name: v.string(),
        offerKinds: v.array(validators.modality),
        uncovered: v.array(validators.modality),
      }),
    ),
    suggestedSei: v.string(),
  }),
  handler: async (ctx, { id }) => {
    const { user } = await requireNativeUser(ctx);
    reviewer(user);
    const row = await calendarRow(ctx, user, id);
    const campus = await campusName(ctx, row);
    const review = await ctx.db
      .query('reviews')
      .withIndex('by_calendarId', (q) => q.eq('calendarId', id))
      .unique();
    return {
      replaced: (await overlapping(ctx, row, ['vigente'])).map((other) => ({
        id: other._id,
        name: calendarName(other.year, campus, other.label),
        offerKinds: other.offerKinds,
        uncovered: other.offerKinds.filter((kind) => !row.offerKinds.includes(kind)),
      })),
      suggestedSei: row.seiProcess ?? review?.processNumber ?? '',
    };
  },
});
