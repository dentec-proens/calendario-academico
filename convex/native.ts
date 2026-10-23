import { ConvexError, v } from 'convex/values';
import { query, mutation, internalQuery, internalMutation } from './_generated/server';
import type { QueryCtx, MutationCtx } from './_generated/server';
import { requireNativeUser, safeMember } from './nativeAuth';
import type { Member } from './authContracts';
import type { SnapshotOptions } from './model';
import { readSnapshot, applyChanges } from './store';
import { readAuditPage } from './audit';
import { changesBetween, equal } from '../src/convex-diff.mjs';
import { decodeValue } from '../src/convex-codec.mjs';
import { normalizeCalendar } from '../src/calendar-normalize.mjs';
import { calendarName } from '../src/calendar-label.mjs';
import { calendarModalities, modalityLabels } from '../src/modalities.mjs';
import { selectableCampuses } from '../src/campus-selection.mjs';
import {
  documentMetadata,
  documentSnapshot,
  setDocumentStatus,
  documentTypes,
} from '../src/document-state.mjs';
import { inheritedEvents } from '../src/institution.mjs';
import { datesBetween } from '../src/calendar.ts';
import { validCategory } from '../src/categories.mjs';
import { releaseReadiness } from '../src/release.mjs';
import { mergeLegacyStages } from '../src/obligations.mjs';
import { recalculatePeriods } from '../src/duration.mjs';
import { recalculateAssessmentStages } from '../src/stage-suggestions.mjs';
import { historyCandidateKey } from '../src/history-progress.mjs';
import {
  reviewSupport,
  reviewCriteria,
  reviewStatuses,
  initialConclusion,
} from '../src/review.mjs';
import { reviewNorm, presentReviewText } from '../src/review-presentation.mjs';
import { updateConclusion } from '../src/review-conclusion.mjs';
import { reviewDocument } from '../src/review-export.mjs';
import { auditLog } from '../src/audit-log.mjs';

type Context = QueryCtx | MutationCtx;
type User = Member;
const commonFields = [
  'campuses',
  'catalogue',
  'calendars',
  'histories',
  'documents',
  'reviews',
  'audit',
];
const json = (value: unknown) => JSON.parse(JSON.stringify(value ?? null));
function fail(message: string, status = 400): never {
  throw Object.assign(Error(message), { status });
}
const text = (value: unknown, maximum = 240): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    fail('Campo obrigatório ou texto muito longo.');
  return value.trim();
};
// Convex seeds Math.random per transaction, including retries.
const newId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (letter) => {
    const n = Math.floor(Math.random() * 16);
    return (letter === 'x' ? n : (n & 3) | 8).toString(16);
  });
const safeUser = safeMember;
const adminUser = (user: User) => {
  if (user.role !== 'ADMIN') fail('Acesso exclusivo da administração.', 403);
};
const owned = (user: User, item: any) => {
  if (!item || item.deletedAt || (user.role !== 'ADMIN' && item.campusId !== user.campusId))
    fail('Registro não encontrado.', 404);
  if (item.state) item.name = calendarName(item.state.year, item.state.campus);
  return item;
};
function guardPath(path: string) {
  if (!path.startsWith('/api/') || path.length > 500) fail('Destino inválido.');
  return new URL(path, 'https://native.invalid');
}
function asConvexError(error: unknown): never {
  if (error instanceof ConvexError) throw error;
  const message = error instanceof Error ? error.message : '';
  const status =
    error && typeof error === 'object' && 'status' in error && typeof error.status === 'number'
      ? error.status
      : undefined;
  const unauthenticated = message === 'Entre com sua conta.';
  throw new ConvexError({
    status: status || (unauthenticated ? 401 : 400),
    error:
      status || unauthenticated || error instanceof RangeError
        ? message
        : 'Não foi possível concluir a operação.',
  });
}
async function optionsFor(
  ctx: Context,
  user: User,
  path: string,
  options: SnapshotOptions = {},
): Promise<SnapshotOptions> {
  let calendarId = path.match(/^\/api\/(?:calendars|reviews)\/([\w-]+)/)?.[1];
  const historyId = path.match(/^\/api\/history\/([\w-]+)/)?.[1];
  if (!calendarId && historyId) {
    const row = await ctx.db
      .query('histories')
      .withIndex('by_appId', (q) => q.eq('appId', historyId))
      .unique();
    calendarId = owned(user, row ? decodeValue(row.value) : null).calendarId;
  }
  return {
    fields: commonFields,
    appendOnlyAudit: true,
    ...(calendarId ? { calendarId } : {}),
    ...(user.role === 'CAMPUS' && user.campusId ? { campusId: user.campusId } : {}),
    ...options,
  };
}

export async function loadNativeState(
  ctx: Context,
  path: string,
  fields = commonFields,
  summary = false,
) {
  const { user, row } = await requireNativeUser(ctx);
  const options = await optionsFor(ctx, user, path, { fields, summary });
  const snapshot = await readSnapshot(ctx, options);
  return { user, row, db: decodeValue(snapshot.state), snapshot, options };
}
async function domain(ctx: Context, path: string, method: string, body: any) {
  const { user } = await requireNativeUser(ctx);
  const reads = new Map<string, Promise<any>>();
  const read = (options: SnapshotOptions = {}) => {
    const key = JSON.stringify(options);
    if (!reads.has(key))
      reads.set(
        key,
        (async () =>
          decodeValue(
            (await readSnapshot(ctx, await optionsFor(ctx, user, path, options))).state,
          ))(),
      );
    return reads.get(key)!;
  };
  const change = async (fn: (db: any) => any, supplied: SnapshotOptions = {}) => {
    if (!('insert' in ctx.db)) fail('Esta operação exige uma mutation.');
    const options = await optionsFor(ctx, user, path, supplied);
    const snapshot = await readSnapshot(ctx, options);
    const before = decodeValue(snapshot.state),
      next = decodeValue(snapshot.state);
    next.audit ??= [];
    const result = await fn(next);
    const changes = changesBetween(before, next, snapshot.keys, options, newId);
    await applyChanges(ctx as MutationCtx, changes, options);
    return result;
  };
  const admin = () => adminUser(user);
  const owns = (item: any) => owned(user, item);
  const audit = (db: any, action: string, id: string) => {
    const calendar = db.calendars?.find((c: any) => c.id === id);
    db.audit ??= [];
    db.audit.push({
      at: new Date().toISOString(),
      actor: user.id,
      action,
      id,
      version: calendar?.version,
      campusId: calendar?.campusId,
    });
  };
  let output: any;
  const send = (value: any) => {
    output = value;
  };
  const run = async () => {
    if (path === '/api/bootstrap' && method === 'GET') {
      const db = await read({
        fields: ['users', 'campuses', 'catalogue', 'calendars'],
        summary: true,
      });
      send({
        user: safeUser(user),
        campuses: selectableCampuses(db.campuses).filter(
          (c: any) => user.role === 'ADMIN' || c.id === user.campusId,
        ),
        catalogue: db.catalogue,
        calendars: db.calendars
          .filter(
            (c: any) => !c.deletedAt && (user.role === 'ADMIN' || c.campusId === user.campusId),
          )
          .map(({ state, versions: _versions, ...c }: any) => ({
            ...c,
            name: calendarName(state.year, state.campus),
            year: state.year,
            offer: state.offer,
            modalities: calendarModalities(state),
          })),
        users: user.role === 'ADMIN' ? db.users.filter((u: any) => !u.removedAt).map(safeUser) : [],
      });
      return;
    }
    if (path === '/api/calendar-trash' && method === 'GET') {
      const db = await read({ fields: ['calendars'], summary: true });
      send({
        calendars: db.calendars
          .filter(
            (c: any) => c.deletedAt && (user.role === 'ADMIN' || c.campusId === user.campusId),
          )
          .map((c: any) => ({
            id: c.id,
            name: calendarName(c.state.year, c.state.campus),
            campusId: c.campusId,
            deletedAt: c.deletedAt,
            version: c.version,
          })),
      });
      return;
    }
    const lifecycle = path.match(/^\/api\/calendars\/([\w-]+)(?:\/(restore))?$/);
    if (
      lifecycle &&
      ((method === 'DELETE' && !lifecycle[2]) || (method === 'POST' && lifecycle[2] === 'restore'))
    ) {
      await change((db: any) => {
        const c = db.calendars.find((c: any) => c.id === lifecycle[1]);
        if (!c || (user.role !== 'ADMIN' && c.campusId !== user.campusId))
          fail('Registro não encontrado.', 404);
        if (lifecycle[2]) {
          if (!c.deletedAt) fail('Calendário já está ativo.', 409);
          delete c.deletedAt;
          delete c.deletedBy;
          audit(db, 'RESTORE_CALENDAR', c.id);
        } else {
          if (c.deletedAt) fail('Calendário já está na lixeira.', 409);
          if (body.version !== c.version)
            fail('O calendário foi alterado. Atualize a lista antes de excluir.', 409);
          c.deletedAt = new Date().toISOString();
          c.deletedBy = user.id;
          audit(db, 'DELETE_CALENDAR', c.id);
        }
      });
      send({ ok: true });
      return;
    }
    if (path === '/api/documents' && method === 'GET') {
      const db = await read({ fields: ['catalogue', 'documents'] });
      send({
        revision: db.catalogue.revision,
        documents: (db.documents || [])
          .filter((d: any) => user.role === 'ADMIN' || d.publishedAt)
          .map(documentMetadata),
      });
      return;
    }

    const documentMatch = path.match(/^\/api\/documents\/([\w-]+)\/status$/);
    if (documentMatch && method === 'POST') {
      admin();
      return change((db: any) => setDocumentStatus(db, documentMatch[1], body, user.id));
    }

    if (path === '/api/campuses' && method === 'POST') {
      admin();
      const c = { id: newId(), name: text(body.name, 120) };
      await change((db: any) => {
        if (db.campuses.some((x: any) => x.name.toLowerCase() === c.name.toLowerCase()))
          fail('Unidade já cadastrada.', 409);
        db.campuses.push(c);
        audit(db, 'CREATE_CAMPUS', c.id);
      });
      send(c);
      return;
    }

    if (path === '/api/catalogue' && method === 'POST') {
      admin();
      const e = {
        id: body.id || newId(),
        name: text(body.name, 160),
        start: body.start,
        end: body.end,
        kind: body.kind,
        category: text(body.category, 40),
        evidence: text(body.evidence),
        offers: body.offers,
        active: body.active !== false,
      };
      text(e.id, 100);
      if (!validCategory(e.category)) fail('Categoria PROENS inválida.');
      datesBetween(e.start, e.end);
      if (
        e.start.slice(0, 4) !== e.end.slice(0, 4) ||
        !['exclude', 'include', 'note'].includes(e.kind) ||
        !Array.isArray(e.offers) ||
        !e.offers.length ||
        e.offers.some((o: any) => !Object.keys(modalityLabels).includes(o))
      )
        fail('Datas, efeito ou ofertas inválidos.');
      await change((db: any) => {
        if (body.revision !== db.catalogue.revision)
          fail('Base atualizada por outra sessão. Recarregue.', 409);
        const i = db.catalogue.events.findIndex((x: any) => x.id === e.id);
        if (i < 0) db.catalogue.events.push(e);
        else db.catalogue.events[i] = e;
        db.catalogue.revision++;
        audit(db, 'UPDATE_CATALOGUE', e.id);
      });
      send({ ok: true });
      return;
    }
    if (path === '/api/calendars' && method === 'POST') {
      const c = await change((db: any) => {
        const campus = selectableCampuses(db.campuses).find((c: any) => c.id === body.campusId);
        if (!campus) fail('Campus inválido.');
        owns({ campusId: campus.id });
        const state = normalizeCalendar({
          campus: campus.name,
          year: Number(body.year),
          modalities: body.modalities,
          offer: body.modalities?.[0] || body.offer,
          regime: body.regime,
          weekdays: [],
          weekConfirmed: false,
          weekEvidence: '',
          periods: [],
          events: [],
        });
        const c = {
          id: newId(),
          campusId: campus.id,
          purpose: body.purpose === 'test' ? 'test' : 'definitive',
          name: calendarName(state.year, campus.name),
          courses: text(body.courses, 1000),
          classes: String(body.classes || '').slice(0, 500),
          shifts: String(body.shifts || '').slice(0, 200),
          state,
          version: 1,
          versions: [],
          catalogueRevision: db.catalogue.revision,
          documentSnapshot: documentSnapshot(db, state.year),
          institutionalSnapshot: inheritedEvents(
            db.catalogue,
            state.year,
            calendarModalities(state),
            state,
          ),
          updatedAt: new Date().toISOString(),
        };
        db.calendars.push(c);
        audit(db, 'CREATE_CALENDAR', c.id);
        return c;
      });
      send(c);
      return;
    }
    const reviewMatch = path.match(/^\/api\/reviews\/([\w-]+)(?:\/(export))?$/);
    if (reviewMatch) {
      admin();
      const id = reviewMatch[1],
        db = await read(),
        record = owns(db.calendars.find((c: any) => c.id === id));
      if (reviewMatch[2] === 'export' && method === 'POST') {
        const saved = (db.reviews || []).find((r: any) => r.calendarId === id);
        if (!saved) fail('Salve a análise inicial ou a revisão antes de exportar.', 409);
        if (
          saved.revision !== body.revision ||
          saved.calendarVersion !== record.version ||
          saved.catalogueRevision !== db.catalogue.revision
        )
          fail('A análise está desatualizada. Reabra, confira e salve antes de exportar.', 409);
        send(reviewDocument(record, saved));
        return;
      }
      if (!reviewMatch[2] && method === 'GET') {
        const saved = (db.reviews || []).find((r: any) => r.calendarId === id);
        const support = reviewSupport(record, [
          ...inheritedEvents(
            db.catalogue,
            record.state.year,
            calendarModalities(record.state),
            record.state,
          ),
          ...record.state.events,
        ]);
        send({
          ...support,
          initialConclusion: initialConclusion(support),
          catalogueRevision: db.catalogue.revision,
          review: saved ? { ...saved, history: undefined } : null,
          stale:
            !!saved &&
            (saved.calendarVersion !== record.version ||
              saved.catalogueRevision !== db.catalogue.revision),
        });
        return;
      }
      if (!reviewMatch[2] && method === 'PUT') {
        const support = reviewSupport(record, [
          ...inheritedEvents(
            db.catalogue,
            record.state.year,
            calendarModalities(record.state),
            record.state,
          ),
          ...record.state.events,
        ]);
        if (
          !Array.isArray(body.entries) ||
          body.entries.length !== reviewCriteria.length ||
          new Set(body.entries.map((e: any) => e.id)).size !== reviewCriteria.length
        )
          fail('Confira todos os critérios da revisão.');
        const entries = body.entries.map((e: any) => {
          if (!reviewCriteria.some((c: any) => c.id === e.id) || !reviewStatuses.includes(e.status))
            fail('Critério ou situação inválidos.');
          const notes = String(e.notes || '');
          if (notes.length > 2000) fail('Observação muito longa.');
          if (e.status === 'PENDENTE' && e.reviewed === true)
            fail('Selecione Atendido, Não atendido ou Não aplicável antes de confirmar a análise.');
          return {
            id: e.id,
            status: e.status,
            notes,
            reviewed: e.reviewed === true && e.status !== 'PENDENTE',
          };
        });
        const conclusion = updateConclusion(
          presentReviewText(body.conclusion, record.state.year),
          reviewCriteria,
          entries,
          reviewNorm(record.state.year, support.sameYear ? support.source.norm : ''),
        );
        if (conclusion.length > 8000) fail('Síntese muito longa.');
        const processNumber = String(body.processNumber || ''),
          applicableNorm =
            presentReviewText(body.applicableNorm, record.state.year) ||
            reviewNorm(record.state.year);
        if (processNumber.length > 100 || applicableNorm.length > 1000)
          fail('Identificação do processo ou norma muito longa.');
        const saved = await change((db: any) => {
          const current = owns(db.calendars.find((c: any) => c.id === id));
          db.reviews ??= [];
          const prior = db.reviews.find((r: any) => r.calendarId === id);
          if (
            body.calendarVersion !== current.version ||
            body.catalogueRevision !== db.catalogue.revision
          )
            fail('O calendário ou a base mudou. Reabra a revisão.', 409);
          if (body.revision !== (prior?.revision || 0))
            fail('Outro revisor atualizou esta análise. Reabra antes de salvar.', 409);
          if (
            prior &&
            (prior.calendarVersion !== current.version ||
              prior.catalogueRevision !== db.catalogue.revision) &&
            body.acknowledgeStale !== true
          )
            fail('Confirme a reavaliação das conclusões anteriores após a mudança de versão.', 409);
          const { history: oldHistory, ...snapshot } = prior || {};
          const next = {
            calendarId: id,
            calendarVersion: current.version,
            catalogueRevision: db.catalogue.revision,
            revision: (prior?.revision || 0) + 1,
            source: 'SEI 3959640',
            documentSnapshot: documentSnapshot(db, current.state.year),
            entries,
            conclusion,
            processNumber,
            applicableNorm,
            reviewer: { id: user.id, name: user.name },
            updatedAt: new Date().toISOString(),
            officialApproval: false,
            history: prior ? [...(oldHistory || []), snapshot] : [],
          };
          if (prior) db.reviews[db.reviews.indexOf(prior)] = next;
          else db.reviews.push(next);
          audit(db, 'SAVE_HUMAN_REVIEW', id);
          return { revision: next.revision };
        });
        send(saved);
        return;
      }
    }
    const definitiveMatch = path.match(/^\/api\/calendars\/([\w-]+)\/make-definitive$/);
    if (definitiveMatch && method === 'POST') {
      const saved = await change((db: any) => {
        const c = owns(db.calendars.find((c: any) => c.id === definitiveMatch[1]));
        if (c.version !== body.version)
          fail('Há versão mais recente. Reabra o calendário antes de torná-lo definitivo.', 409);
        if (c.purpose === 'test') {
          c.versions.push({
            version: c.version,
            state: c.state,
            purpose: c.purpose,
            at: c.updatedAt,
            catalogueRevision: c.catalogueRevision,
            institutionalEvents: c.institutionalSnapshot,
            documentSnapshot: c.documentSnapshot || [],
          });
          c.purpose = 'definitive';
          c.version++;
          c.updatedAt = new Date().toISOString();
          audit(db, 'MAKE_CALENDAR_DEFINITIVE', c.id);
        }
        return {
          purpose: c.purpose,
          version: c.version,
          updatedAt: c.updatedAt,
          readiness: releaseReadiness(c, db),
        };
      });
      send(saved);
      return;
    }
    const match = path.match(/^\/api\/calendars\/([\w-]+)(?:\/(history|pdf))?$/);
    if (match) {
      const id = match[1],
        db = await read({
          fields: ['calendars', 'catalogue', 'documents', 'histories', 'reviews'],
        }),
        record = owns(db.calendars.find((c: any) => c.id === id));
      if (!match[2] && method === 'GET') {
        send({
          ...record,
          state: { ...record.state, events: mergeLegacyStages(record.state.events) },
          readiness: releaseReadiness(record, db),
          versions: record.versions.map((v: any) => ({
            version: v.version,
            at: v.at,
            catalogueRevision: v.catalogueRevision,
          })),
          institutionalEvents: inheritedEvents(
            db.catalogue,
            record.state.year,
            calendarModalities(record.state),
            record.state,
          ),
          currentCatalogueRevision: db.catalogue.revision,
          currentDocuments: documentSnapshot(db, record.state.year),
          histories: db.histories
            .filter((h: any) => h.calendarId === id)
            .map(({ data: _data, analysis, objectKey: _objectKey, ...h }: any) => ({
              ...h,
              analyzed: !!analysis,
            })),
        });
        return;
      }
      if (!match[2] && method === 'PUT') {
        const state = normalizeCalendar(body.state);
        if (state.year !== record.state.year || state.offer !== record.state.offer)
          fail('Ano e oferta não podem mudar neste registro.');
        state.campus = record.state.campus;
        const saved = await change((db: any) => {
          const c = owns(db.calendars.find((c: any) => c.id === id));
          if (c.version !== body.version) fail('Há versão mais recente. Reabra o calendário.', 409);
          if (body.catalogueRevision !== db.catalogue.revision)
            fail('A base institucional mudou. Reabra para incorporar as alterações.', 409);
          for (const event of state.events) {
            const source = event.historicalSource;
            if (
              source &&
              (!Number.isInteger(source.page) ||
                source.page < 1 ||
                !db.histories.some(
                  (h: any) =>
                    h.id === source.historyId &&
                    h.calendarId === id &&
                    h.analysis?.pages.some((p: any) => p.page === source.page) &&
                    (!source.candidateKey ||
                      h.analysis.candidates.some(
                        (item: any) =>
                          item.page === source.page &&
                          historyCandidateKey(item) === source.candidateKey,
                      )),
                ))
            )
              fail('Referência histórica inválida para este calendário.');
          }
          try {
            state.periods = recalculatePeriods(state, [
              ...inheritedEvents(db.catalogue, state.year, calendarModalities(state), state),
              ...state.events,
            ]);
            state.events = recalculateAssessmentStages(state, [
              ...inheritedEvents(db.catalogue, state.year, calendarModalities(state), state),
              ...state.events,
            ]);
          } catch (error) {
            fail(
              error instanceof Error ? error.message : 'Não foi possível recalcular o calendário.',
            );
          }
          if (
            equal(JSON.parse(JSON.stringify(c.state)), JSON.parse(JSON.stringify(state))) &&
            c.catalogueRevision === db.catalogue.revision &&
            equal(c.documentSnapshot || [], documentSnapshot(db, state.year)) &&
            equal(
              c.institutionalSnapshot,
              inheritedEvents(db.catalogue, state.year, calendarModalities(state), state),
            )
          )
            return {
              version: c.version,
              state: c.state,
              updatedAt: c.updatedAt,
              unchanged: true,
              readiness: releaseReadiness(c, db),
            };
          c.versions.push({
            version: c.version,
            state: c.state,
            at: c.updatedAt,
            catalogueRevision: c.catalogueRevision,
            institutionalEvents: c.institutionalSnapshot,
            documentSnapshot: c.documentSnapshot || [],
          });
          c.state = state;
          c.documentSnapshot = documentSnapshot(db, state.year);
          c.version++;
          c.catalogueRevision = db.catalogue.revision;
          c.institutionalSnapshot = inheritedEvents(
            db.catalogue,
            state.year,
            calendarModalities(state),
            state,
          );
          c.updatedAt = new Date().toISOString();
          audit(db, 'SAVE_CALENDAR', id);
          return {
            version: c.version,
            state: c.state,
            updatedAt: c.updatedAt,
            readiness: releaseReadiness(c, db),
          };
        });
        send(saved);
        return;
      }
    }
    fail('Não encontrado.', 404);
  };
  const returned = await run();
  return returned ?? output;
}

export const read = query({
  args: { path: v.string() },
  returns: v.any(),
  handler: async (ctx, { path }) => {
    try {
      const url = guardPath(path);
      if (url.pathname === '/api/status') {
        let user = null;
        try {
          user = safeUser((await requireNativeUser(ctx)).user);
        } catch {}
        return json({
          setupRequired: false,
          hosted: true,
          googleEnabled: !!process.env.AUTH_GOOGLE_ID,
          user,
          native: true,
        });
      }
      if (url.pathname === '/api/password/options') return { emailEnabled: false };
      if (url.pathname === '/api/file-mode') {
        await requireNativeUser(ctx);
        return { direct: true, native: true };
      }
      if (url.pathname === '/api/logs') {
        const { user } = await requireNativeUser(ctx),
          offset = Number(url.searchParams.get('offset') || 0);
        const result = await readAuditPage(ctx, user.role, user.campusId || null, offset);
        return json({
          entries: auditLog(decodeValue(result.state), user).entries,
          nextOffset: result.hasMore ? offset + 100 : null,
        });
      }
      return json(await domain(ctx, url.pathname, 'GET', {}));
    } catch (error) {
      asConvexError(error);
    }
  },
});
export const write = mutation({
  args: { path: v.string(), method: v.string(), body: v.any() },
  returns: v.any(),
  handler: async (ctx, { path, method, body }) => {
    try {
      const url = guardPath(path);
      if (!['POST', 'PUT', 'DELETE'].includes(method)) fail('Método inválido.');
      if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Dados inválidos.');
      return json(await domain(ctx, url.pathname, method, body));
    } catch (error) {
      asConvexError(error);
    }
  },
});

// Actions execute CPU-heavy PDF work outside transactions. Only their necessary
// authorized inputs cross this internal boundary; credentials never leave auth.
export const actionContext = internalQuery({
  args: { path: v.string(), body: v.any() },
  returns: v.any(),
  handler: async (ctx, { path, body }) => {
    try {
      const url = guardPath(path),
        { user, db } = await loadNativeState(ctx, url.pathname);
      const result: any = { user: safeUser(user), catalogue: db.catalogue };
      const calendarId = url.pathname.match(/^\/api\/(?:calendars|reviews)\/([\w-]+)/)?.[1];
      if (calendarId) {
        const record = owned(
          user,
          db.calendars.find((c: any) => c.id === calendarId),
        );
        result.record = record;
        result.readiness = releaseReadiness(record, db);
        result.currentCatalogueRevision = db.catalogue.revision;
        if (url.pathname.endsWith('/pdf')) {
          if (
            body.version !== record.version ||
            body.catalogueRevision !== db.catalogue.revision ||
            record.catalogueRevision !== db.catalogue.revision
          )
            fail('Salve a versão atual com a base institucional atualizada antes de baixar.', 409);
          result.proposalCopy = body.copy === true && record.purpose !== 'test';
          if (record.purpose !== 'test' && !result.readiness.ready && !result.proposalCopy)
            fail('Geração definitiva bloqueada. ' + result.readiness.issues.join('\n'), 409);
        }
        if (url.pathname.startsWith('/api/reviews/')) {
          adminUser(user);
          const review = (db.reviews || []).find((r: any) => r.calendarId === calendarId);
          if (!review) fail('Salve a análise inicial ou a revisão antes de exportar.', 409);
          if (
            review.revision !== body.revision ||
            review.calendarVersion !== record.version ||
            review.catalogueRevision !== db.catalogue.revision
          )
            fail('A análise está desatualizada. Reabra, confira e salve antes de exportar.', 409);
          result.review = review;
        }
      }
      const historyId = url.pathname.match(/^\/api\/history\/([\w-]+)/)?.[1];
      if (historyId) {
        const history = owned(
          user,
          db.histories.find((h: any) => h.id === historyId),
        );
        result.record = owned(
          user,
          db.calendars.find((c: any) => c.id === history.calendarId),
        );
        result.history = history;
      }
      const documentId = url.pathname.match(/^\/api\/documents\/([\w-]+)$/)?.[1];
      if (documentId) {
        const document = db.documents?.find(
          (d: any) => d.id === documentId && (user.role === 'ADMIN' || d.publishedAt),
        );
        if (!document) fail('Documento não encontrado.', 404);
        result.document = document;
      }
      if (url.pathname === '/api/documents') adminUser(user);
      return json(result);
    } catch (error) {
      asConvexError(error);
    }
  },
});

export const finishAction = internalMutation({
  args: { path: v.string(), body: v.any(), result: v.any() },
  returns: v.any(),
  handler: async (ctx, { path, body, result }) => {
    try {
      const url = guardPath(path),
        { user, row, db, snapshot, options } = await loadNativeState(ctx, url.pathname);
      const before = decodeValue(snapshot.state),
        at = new Date().toISOString();
      db.audit ??= [];
      let output: any;
      const historyUpload = url.pathname.match(/^\/api\/calendars\/([\w-]+)\/history$/);
      const analysis = url.pathname.match(/^\/api\/history\/([\w-]+)\/analysis$/);
      if (url.pathname === '/api/documents' || historyUpload) {
        if (url.pathname === '/api/documents') adminUser(user);
        if (
          !result?.objectKey ||
          !Number.isInteger(result.size) ||
          result.size < 5 ||
          result.size > 8_000_000 ||
          !/^[a-f0-9]{64}$/.test(result.hash || '')
        )
          fail('Arquivo validado ausente.');
        const file = await ctx.db
          .query('fileObjects')
          .withIndex('by_path', (q) => q.eq('path', result.objectKey))
          .unique();
        if (!file) fail('Arquivo não encontrado.', 404);
        const upload =
          typeof result.uploadId === 'string'
            ? await ctx.db
                .query('nativeUploads')
                .withIndex('by_uploadId', (q) => q.eq('uploadId', result.uploadId))
                .unique()
            : null;
        if (
          !upload ||
          upload.ownerId !== row._id ||
          upload.expiresAt <= Date.now() ||
          !upload.completedAt ||
          upload.consumedAt ||
          upload.storageId !== file.storageId ||
          upload.objectKey !== result.objectKey ||
          upload.hash !== result.hash ||
          upload.size !== result.size ||
          upload.filename !== body.filename
        )
          fail('Envio expirado, já utilizado ou incompatível.', 409);
        await ctx.db.patch(upload._id, { consumedAt: Date.now() });
        const filename = text(body.filename, 180);
        if (!filename.toLowerCase().endsWith('.pdf')) fail('Envie um PDF.');
        if (historyUpload) {
          const record = owned(
            user,
            db.calendars.find((c: any) => c.id === historyUpload[1]),
          );
          if (Number(body.year) !== record.state.year - 1)
            fail('Informe o ano anterior ao calendário em elaboração.');
          const item = {
            id: newId(),
            calendarId: record.id,
            campusId: record.campusId,
            year: Number(body.year),
            offer: record.state.offer,
            filename,
            objectKey: result.objectKey,
            hash: result.hash,
            notes: String(body.notes || '').slice(0, 5000),
            createdAt: at,
          };
          db.histories ??= [];
          db.histories.push(item);
          db.audit.push({
            at,
            actor: user.id,
            action: 'UPLOAD_HISTORY',
            id: item.id,
            campusId: record.campusId,
          });
          output = { id: item.id };
        } else {
          adminUser(user);
          const year = Number(body.year);
          if (
            !Number.isInteger(year) ||
            year < 1900 ||
            year > 9999 ||
            !documentTypes.includes(body.type)
          )
            fail('Informe ano e tipo válidos.');
          db.documents ??= [];
          const item = {
            id: newId(),
            year,
            type: body.type,
            title: text(body.title, 240),
            source: text(body.source, 1000),
            filename,
            size: result.size,
            hash: result.hash,
            objectKey: result.objectKey,
            status: 'rascunho',
            version:
              1 +
              Math.max(
                0,
                ...db.documents
                  .filter((d: any) => d.year === year && d.type === body.type)
                  .map((d: any) => d.version),
              ),
            createdAt: at,
            createdBy: user.id,
          };
          db.documents.push(item);
          db.audit.push({
            at,
            actor: user.id,
            action: 'UPLOAD_INSTITUTIONAL_DOCUMENT',
            id: item.id,
          });
          output = documentMetadata(item);
        }
      } else if (analysis) {
        const item = owned(
          user,
          db.histories.find((h: any) => h.id === analysis[1]),
        );
        owned(
          user,
          db.calendars.find((c: any) => c.id === item.calendarId),
        );
        if (body.hash && body.hash !== item.hash)
          fail('O arquivo histórico mudou durante a análise.', 409);
        item.analysis = result;
        db.audit.push({
          at,
          actor: user.id,
          action: 'ANALYZE_HISTORY',
          id: item.id,
          campusId: item.campusId,
        });
        output = result;
      } else fail('Conclusão de ação inválida.');
      await applyChanges(ctx, changesBetween(before, db, snapshot.keys, options, newId), options);
      return json(output);
    } catch (error) {
      asConvexError(error);
    }
  },
});
