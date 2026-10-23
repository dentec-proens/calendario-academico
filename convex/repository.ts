import { ConvexError } from 'convex/values';
import type { Infer } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx, MutationCtx } from './_generated/server';
import type { Member } from './authContracts';
import type { DomainState, ContentState } from './validators';
import type { documentSnapshot, auditTarget } from './validators';
import { calendarName } from '../src/calendar-label.mjs';
import { normalizeCalendar } from '../src/calendar-normalize.mjs';
import { teacherVacations } from '../src/teacher-vacations.mjs';
import { migrateAssessmentEvents } from '../src/obligations.mjs';

export type Context = QueryCtx | MutationCtx;
export function fail(message: string, status = 400): never {
  throw new ConvexError({ status, error: message });
}
export function admin(user: Member) {
  if (user.role !== 'ADMIN') fail('Acesso exclusivo da administração.', 403);
}
export const iso = (at: number) => new Date(at).toISOString();
export function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
export function text(value: string, maximum = 240) {
  if (!value.trim() || value.length > maximum) fail('Campo obrigatório ou texto muito longo.');
  return value.trim();
}
export function assertCampus(user: Member, campusId: Id<'campuses'>) {
  if (user.role !== 'ADMIN' && user.campusId !== campusId) fail('Registro não encontrado.', 404);
}
export async function calendarRow(ctx: Context, user: Member, id: Id<'calendars'>, trash = false) {
  const row = await ctx.db.get(id);
  if (!row || (!trash && row.deletedAt)) fail('Registro não encontrado.', 404);
  assertCampus(user, row.campusId);
  return row;
}
export async function contents(ctx: Context, id: Id<'calendars'>) {
  const row = await ctx.db
    .query('calendarContents')
    .withIndex('by_calendarId', (q) => q.eq('calendarId', id))
    .unique();
  if (!row) fail('Conteúdo do calendário não encontrado.', 404);
  return row;
}
export async function yearRevision(ctx: Context, year: number) {
  return (
    (
      await ctx.db
        .query('catalogueRevisions')
        .withIndex('by_year', (q) => q.eq('year', year))
        .unique()
    )?.revision ?? 1
  );
}
export async function globalRevision(ctx: Context) {
  return (
    (
      await ctx.db
        .query('institutionSettings')
        .withIndex('by_key', (q) => q.eq('key', 'catalogue'))
        .unique()
    )?.revision ?? 1
  );
}
export async function bumpRevision(ctx: MutationCtx, year: number) {
  const scope = await ctx.db
    .query('catalogueRevisions')
    .withIndex('by_year', (q) => q.eq('year', year))
    .unique();
  const revision = (scope?.revision ?? 1) + 1;
  if (scope) await ctx.db.patch(scope._id, { revision });
  else await ctx.db.insert('catalogueRevisions', { year, revision });
  const global = await ctx.db
    .query('institutionSettings')
    .withIndex('by_key', (q) => q.eq('key', 'catalogue'))
    .unique();
  if (global) await ctx.db.patch(global._id, { revision: global.revision + 1 });
  else await ctx.db.insert('institutionSettings', { key: 'catalogue', revision: 2 });
  return revision;
}
export async function catalogue(ctx: Context, year?: number) {
  const rows =
    year === undefined
      ? await ctx.db.query('institutionalEvents').take(1000)
      : await ctx.db
          .query('institutionalEvents')
          .withIndex('by_year', (q) => q.eq('year', year))
          .take(1000);
  if (rows.length === 1000) fail('Consulte a base institucional por ano.');
  return {
    revision: year === undefined ? await globalRevision(ctx) : await yearRevision(ctx, year),
    events: rows.map(
      ({ code, name, start, end, kind, category, evidence, modalities, active }) => ({
        id: code,
        name,
        start,
        end,
        kind,
        category,
        evidence,
        offers: modalities,
        active,
      }),
    ),
  };
}
export function summary(row: Doc<'calendars'>, campus: Doc<'campuses'>) {
  return {
    id: row._id,
    name: calendarName(row.year, campus.name),
    campusId: row.campusId,
    year: row.year,
    modalities: row.modalities,
    offer: row.modalities[0],
    purpose: row.purpose,
    courses: row.courses,
    classes: row.classes,
    shifts: row.shifts,
    version: row.version,
    updatedAt: iso(row.updatedAt),
    ...(row.deletedAt ? { deletedAt: iso(row.deletedAt) } : {}),
  };
}
export function domainState(
  row: Doc<'calendars'>,
  campus: Doc<'campuses'>,
  state: ContentState,
): DomainState {
  return {
    ...state,
    schemaVersion: 1,
    year: row.year,
    campus: campus.name,
    modalities: row.modalities,
    offer: row.modalities[0],
  };
}
export function toContent(input: DomainState): ContentState {
  const normalized = normalizeCalendar(input) as DomainState;
  const {
    schemaVersion: _schema,
    year,
    campus: _campus,
    offer: _offer,
    modalities,
    assessmentStages,
    ...state
  } = normalized;
  state.assessmentStagesByModality = Object.fromEntries(
    modalities.flatMap((m) => {
      const n = normalized.assessmentStagesByModality?.[m] ?? assessmentStages;
      return n ? [[m, n]] : [];
    }),
  );
  state.events = migrateAssessmentEvents({ ...normalized, ...state });
  const vacation = normalized.teacherVacations;
  if (vacation && !vacation.firstStart) {
    const legacy = vacation as unknown as { julyStart: string; evidence: string };
    const converted = teacherVacations(year, legacy.julyStart, legacy.evidence);
    state.teacherVacations = {
      firstStart: converted.events[0].start,
      firstEnd: converted.events[0].end,
      secondStart: converted.events[1].start,
      secondEnd: converted.events[1].end,
      evidence: legacy.evidence,
    };
  }
  return clean({ ...state, ignoredHistory: state.ignoredHistory ?? [] });
}
export function documentValue(row: Doc<'documents'>): Infer<typeof documentSnapshot> {
  const { _id, _creationTime: _at, ...fields } = row;
  return { id: _id, ...fields };
}
export function documentDto(row: Infer<typeof documentSnapshot>) {
  const { createdAt, publishedAt, archivedAt, ...fields } = row;
  return {
    ...fields,
    createdAt: iso(createdAt),
    ...(publishedAt !== undefined ? { publishedAt: iso(publishedAt) } : {}),
    ...(archivedAt !== undefined ? { archivedAt: iso(archivedAt) } : {}),
  };
}
export async function currentDocuments(ctx: Context, year: number) {
  const groups = await Promise.all(
    (['norma', 'referencia', 'parecer'] as const).map((type) =>
      ctx.db
        .query('documents')
        .withIndex('by_year_and_type_and_status', (q) =>
          q.eq('year', year).eq('type', type).eq('status', 'vigente'),
        )
        .take(2),
    ),
  );
  if (groups.some((rows) => rows.length > 1))
    fail('Há mais de um documento vigente do mesmo tipo e ano. Confira a base institucional.');
  return groups.flat().map(documentValue);
}
export async function appendAudit(
  ctx: MutationCtx,
  user: Member,
  action: string,
  target: Infer<typeof auditTarget>,
  scope: { campusId?: Id<'campuses'>; calendarId?: Id<'calendars'>; version?: number } = {},
) {
  await ctx.db.insert('audit', { at: Date.now(), actorId: user.id, action, target, ...scope });
}
export function reviewDto(row: Doc<'reviews'>) {
  const { _id, _creationTime, ...fields } = row;
  return {
    ...fields,
    updatedAt: iso(row.updatedAt),
    documentSnapshot: row.documentSnapshot.map(documentDto),
    officialApproval: false as const,
  };
}
export async function reviewRow(ctx: Context, id: Id<'calendars'>) {
  return ctx.db
    .query('reviews')
    .withIndex('by_calendarId', (q) => q.eq('calendarId', id))
    .unique();
}
