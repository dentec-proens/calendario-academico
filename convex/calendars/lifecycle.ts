import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  inFlowStatuses,
  sharedKinds,
  statusLabels,
  type CalendarStatus,
  type LifecycleRole,
} from '../../src/domain/calendar/lifecycle';
import { modalityLabels } from '../../src/domain/calendar/modalities';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import type { Member } from '../access/contracts';
import type { Context } from '../lib/shared';
import { fail } from '../lib/shared';

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
 * Calendars of the same campus and year in the given statuses that share an offer kind.
 * An index cannot filter array elements: each status is read in full and compared in memory.
 */
export async function overlapping(
  ctx: Context,
  row: Pick<Doc<'calendars'>, '_id' | 'campusId' | 'year' | 'offerKinds'>,
  statuses: readonly CalendarStatus[],
  kinds: readonly Doc<'calendars'>['offerKinds'][number][] = row.offerKinds,
) {
  const rows: Doc<'calendars'>[] = [];
  for (const status of statuses)
    rows.push(
      // Bounded by campus, year and status; truncating would let an overlap slip through.
      ...(await ctx.db
        .query('calendars')
        .withIndex('by_campusId_and_year_and_status', (q) =>
          q.eq('campusId', row.campusId).eq('year', row.year).eq('status', status),
        )
        .collect()),
    );
  return rows.filter(
    (other) =>
      other._id !== row._id && !other.deletedAt && sharedKinds(other.offerKinds, kinds).length,
  );
}

const kindList = (kinds: readonly string[]) =>
  kinds.map((kind) => modalityLabels[kind] ?? kind).join(', ');

/** One calendar per campus, year and offer kind between submission and publication. */
export async function assertUniqueInFlow(
  ctx: Context,
  row: Pick<Doc<'calendars'>, '_id' | 'campusId' | 'year' | 'offerKinds'>,
  kinds: readonly Doc<'calendars'>['offerKinds'][number][] = row.offerKinds,
) {
  const others = await overlapping(ctx, row, inFlowStatuses, kinds);
  if (others.length)
    fail(
      `Já há calendário em análise para ${kindList(
        sharedKinds(
          others.flatMap((other) => other.offerKinds),
          kinds,
        ),
      )} neste campus e ano (${others.map((other) => statusLabels[other.status].toLowerCase()).join(', ')}). Recolha ou conclua o outro envio antes de continuar.`,
      409,
    );
}

/**
 * The published calendars a publication replaces. Each must have every offer kind covered by the
 * new calendar, unless the administration explicitly confirms a partial replacement.
 */
export async function replacedCalendars(
  ctx: Context,
  row: Pick<Doc<'calendars'>, '_id' | 'campusId' | 'year' | 'offerKinds'>,
  partial: { allowed: boolean; confirmed: boolean },
) {
  const replaced = await overlapping(ctx, row, ['vigente']);
  const uncovered = replaced.flatMap((other) =>
    other.offerKinds.filter((kind) => !row.offerKinds.includes(kind)),
  );
  if (uncovered.length && !(partial.allowed && partial.confirmed))
    fail(
      partial.allowed
        ? `A publicação substitui calendários vigentes que também atendem ${kindList([...new Set(uncovered)])}. Confirme a substituição parcial: esses tipos ficarão sem calendário vigente.`
        : `O calendário precisa incluir ${kindList([...new Set(uncovered)])}, atendidos pelo calendário vigente que ele substituirá. A administração pode confirmar uma substituição parcial.`,
      409,
    );
  return { replaced, uncovered: [...new Set(uncovered)] };
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
