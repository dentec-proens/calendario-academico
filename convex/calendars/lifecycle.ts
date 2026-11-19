import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { calendarName, missingLabelIssue, repeatedLabel } from '../../src/domain/calendar/label';
import type { LifecycleRole } from '../../src/domain/calendar/lifecycle';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import type { Member } from '../access/contracts';
import type { Context } from '../lib/shared';
import { fail } from '../lib/shared';
import { campusName } from './model';

export const lifecycleRole = (user: Member): LifecycleRole => user.role;

/** Key order never changes the fingerprint of the same content. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    );
  return value;
}

export function contentHash(
  content: Pick<
    Doc<'calendarContents'>,
    'state' | 'catalogueRevision' | 'institutionalSnapshot' | 'documentSnapshot'
  >,
) {
  const { state, catalogueRevision, institutionalSnapshot, documentSnapshot } = content;
  return bytesToHex(
    sha256(
      new TextEncoder().encode(
        JSON.stringify(
          canonical({ state, catalogueRevision, institutionalSnapshot, documentSnapshot }),
        ),
      ),
    ),
  );
}

/** Margin under Convex's 1 MiB document limit. */
export const maximumSubmissionBytes = 900 * 1024;
/**
 * The criteria a return copies live in that margin, and every open of the editor reads them. A full
 * parecer of long observations can pass this, so it is refused, never cut: a shortened observation
 * would tell the campus something the reviewer did not write.
 */
export const maximumReturnedCriteriaBytes = 64 * 1024;
/** The submission with its decisions, kept clear of the document limit whatever it holds. */
export const maximumSubmissionDocumentBytes = 1000 * 1024;

export const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

/**
 * The calendars of a campus and year outside the trash. Bounded by campus and year, which every
 * version inherits; the rules below read them all and decide in memory.
 */
export async function campusYearCalendars(
  ctx: Context,
  row: Pick<Doc<'calendars'>, 'campusId' | 'year'>,
) {
  const rows = await ctx.db
    .query('calendars')
    .withIndex('by_campusId_and_year_and_status', (q) =>
      q.eq('campusId', row.campusId).eq('year', row.year),
    )
    .collect();
  return rows.filter((other) => !other.deletedAt);
}

const labelled = (row: Doc<'calendars'>) => ({
  id: row._id,
  status: row.status,
  label: row.label,
  derivedFrom: row.derivedFrom,
  row,
});

/**
 * The label names the calendar among the others of its campus and year: required, and distinct
 * from every calendar still current except its origin, which a version keeps the label of.
 */
export async function assertLabel(
  ctx: Context,
  row: Doc<'calendars'>,
  label: string | undefined = row.label,
  { required = true }: { required?: boolean } = {},
) {
  if (required && !label?.trim()) fail(missingLabelIssue, 409);
  const repeated = repeatedLabel(
    labelled(row),
    label,
    (await campusYearCalendars(ctx, row)).map(labelled),
  );
  if (repeated)
    fail(
      `Já há ${calendarName(repeated.row.year, await campusName(ctx, row), repeated.row.label)} neste campus e ano. Escolha outro complemento do nome.`,
      409,
    );
}

/** At most this many calendars chosen for replacement in one publication. */
export const maximumReplaced = 24;

/**
 * The published calendars a publication archives: its origin while still in force, and the other
 * calendars in force of the campus and year that the administration chose. A choice no longer in
 * force refuses the publication, so the administration reviews it.
 */
export async function publicationTargets(
  ctx: Context,
  row: Doc<'calendars'>,
  chosen: readonly Id<'calendars'>[],
) {
  if (chosen.length > maximumReplaced) fail('Calendários demais escolhidos para substituição.');
  const inForce = (await campusYearCalendars(ctx, row)).filter(
    (other) => other.status === 'vigente' && other._id !== row._id,
  );
  const origin = inForce.find((other) => other._id === row.derivedFrom);
  const replaced = origin ? [origin] : [];
  for (const id of new Set(chosen)) {
    if (id === row._id) fail('Um calendário não substitui a si mesmo.');
    if (id === row.derivedFrom) continue;
    const other = inForce.find((item) => item._id === id);
    if (!other)
      fail(
        'Um dos calendários escolhidos para substituição não está mais vigente neste campus e ano. Reveja a escolha.',
        409,
      );
    replaced.push(other);
  }
  return replaced;
}

/**
 * The calendar in force in place of an archived one: down its chain of successors, or a version
 * derived from it. Restoring it would leave two calendars in force for the same courses.
 */
export async function reinstateBlocker(ctx: Context, row: Doc<'calendars'>) {
  const others = await campusYearCalendars(ctx, row);
  const byId = new Map(others.map((other) => [other._id, other]));
  const seen = new Set<Id<'calendars'>>([row._id]);
  for (let next = row.supersededBy; next && !seen.has(next) && seen.size <= 20;) {
    seen.add(next);
    const successor = byId.get(next);
    if (!successor) break;
    if (successor.status === 'vigente') return successor;
    next = successor.supersededBy;
  }
  return others.find((other) => other.derivedFrom === row._id && other.status === 'vigente');
}

export async function submissionRow(ctx: Context, id: Id<'calendarSubmissions'> | undefined) {
  if (!id) fail('O calendário não tem envio aberto.', 409);
  const row = await ctx.db.get(id);
  if (!row) fail('Envio não encontrado.', 404);
  return row;
}

export async function nextSequence(ctx: Context, calendarId: Id<'calendars'>) {
  const last = await ctx.db
    .query('calendarSubmissions')
    .withIndex('by_calendarId_and_sequence', (q) => q.eq('calendarId', calendarId))
    .order('desc')
    .first();
  return (last?.sequence ?? 0) + 1;
}

export async function appendDecision(
  ctx: MutationCtx,
  submission: Doc<'calendarSubmissions'>,
  decision: Doc<'calendarSubmissions'>['decisions'][number],
) {
  await ctx.db.patch(submission._id, { decisions: [...submission.decisions, decision] });
}

export const outcome = (
  submission: Pick<Doc<'calendarSubmissions'>, 'decisions'>,
): Doc<'calendarSubmissions'>['decisions'][number]['action'] | 'submitted' =>
  submission.decisions.at(-1)?.action ?? 'submitted';

/** The last return of a calendar, shown to the campus even after the draft is restored. */
export async function lastReturn(ctx: Context, calendarId: Id<'calendars'>) {
  const recent = await ctx.db
    .query('calendarSubmissions')
    .withIndex('by_calendarId_and_sequence', (q) => q.eq('calendarId', calendarId))
    .order('desc')
    .take(20);
  return recent.find((submission) => outcome(submission) === 'returned') ?? null;
}

/** The calendar and its `derivedFrom` ancestors, nearest first. */
export async function lineage(ctx: Context, row: Doc<'calendars'>) {
  const chain = [row];
  let current = row;
  while (current.derivedFrom && chain.length < 20) {
    const parent = await ctx.db.get(current.derivedFrom);
    if (!parent || parent.campusId !== row.campusId) break;
    chain.push(parent);
    current = parent;
  }
  return chain;
}

/** Reviewer decisions keep their author and revision from the campus, as the review does. */
const reviewerDecisions = new Set(['returned', 'concluded', 'reopened']);
export function decisionsFor(
  user: Member,
  decisions: Doc<'calendarSubmissions'>['decisions'],
): Array<
  Omit<Doc<'calendarSubmissions'>['decisions'][number], 'by' | 'reviewRevision'> & {
    by?: { id: Id<'users'>; name: string };
    reviewRevision?: number;
  }
> {
  if (user.role !== 'CAMPUS') return decisions;
  return decisions.map(({ by, reviewRevision: _revision, ...decision }) =>
    reviewerDecisions.has(decision.action) ? decision : { ...decision, by },
  );
}
