/** Offline comparison against an extracted, immutable pre-migration source archive. */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Document, Row, Snapshot } from './types.ts';
import { verifyCanonicalEquivalence } from './canonical.ts';

type Fn = (...args: unknown[]) => unknown;
type Rules = {
  count: Fn;
  layout: Fn;
  review: Fn;
  inherited: Fn;
  readiness: Fn;
};
function record(value: unknown): Document {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Objeto inválido no ensaio de equivalência.');
  return value as Document;
}
async function load(root: string): Promise<Rules> {
  // Candidates go from the current layout to the oldest; archives keep the layout of their time.
  async function exported(candidates: string[], name: string): Promise<Fn> {
    const file =
      candidates.find((candidate) => existsSync(resolve(root, candidate))) ?? candidates.at(-1)!;
    const module = (await import(pathToFileURL(resolve(root, file)).href)) as Record<
      string,
      unknown
    >;
    const fn = module[name];
    if (typeof fn !== 'function') throw Error(`Função ausente no baseline: ${name}.`);
    return fn as Fn;
  }
  const [count, layout, review, inherited, readiness] = await Promise.all([
    exported(
      ['src/domain/calendar/counting/evaluation.ts', 'src/evaluation.ts'],
      'evaluateCalendar',
    ),
    exported(['src/printing/calendar-layout.ts'], 'proensLayout'),
    exported(
      ['src/domain/reviews/technical-support.ts', 'src/domain/reviews/support.ts', 'src/review.ts'],
      'reviewSupport',
    ),
    exported(['src/domain/institution/catalogue.ts', 'src/institution.ts'], 'inheritedEvents'),
    exported(['src/domain/calendar/readiness.ts', 'src/release.ts'], 'releaseReadiness'),
  ]);
  return { count, layout, review, inherited, readiness };
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable((value as Document)[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
const fingerprint = (value: unknown) => createHash('sha256').update(stable(value)).digest('hex');
function attempt(fn: () => unknown): { value: unknown; error?: string } {
  try {
    return { value: fn() };
  } catch (cause) {
    return { value: null, error: cause instanceof Error ? cause.message : String(cause) };
  }
}
function compare(before: unknown, after: unknown, label: string): void {
  if (fingerprint(before) !== fingerprint(after)) throw Error(`Baseline divergente: ${label}.`);
}
type Case = { state: Document; events: unknown[]; version: number; id: string; record: Document };
function cases(snapshot: Snapshot, rules: Rules, live: boolean, canonical = false): Case[] {
  const byId = (rows: Row[] | undefined) => new Map((rows ?? []).map((row) => [row._id, row]));
  const calendars = byId(snapshot.calendars),
    campuses = byId(snapshot.campuses);
  const versions = new Map((snapshot.calendarVersions ?? []).map((row) => [row.snapshotId, row]));
  const catalogue = {
    events: (snapshot.institutionalEvents ?? []).map((row) => {
      const { modalities, ...fields } = row;
      return { ...fields, id: row.code, ...(canonical ? { modalities } : { offers: modalities }) };
    }),
  };
  const result: Case[] = [];
  for (const row of snapshot.calendarContents ?? []) {
    const calendar = calendars.get(String(row.calendarId));
    const campus = calendar && campuses.get(String(calendar.campusId));
    if (!calendar || !campus) throw Error('Referência ausente no estado atual do baseline.');
    const forms = calendar.modalities as string[];
    const state: Document = {
      ...record(row.state),
      schemaVersion: canonical ? 2 : 1,
      year: calendar.year,
      campus: campus.name,
      offer: forms[0],
      modalities: forms,
    };
    const institution = live
      ? rules.inherited(catalogue, calendar.year, forms, state)
      : row.institutionalSnapshot;
    result.push({
      state,
      events: [...(institution as unknown[]), ...(state.events as unknown[])],
      version: Number(calendar.version),
      id: row._id,
      record: {
        ...calendar,
        catalogueRevision: row.catalogueRevision,
        institutionalSnapshot: row.institutionalSnapshot,
      },
    });
  }
  for (const row of snapshot.calendarSnapshots ?? []) {
    const state = record(row.state),
      version = versions.get(row._id);
    result.push({
      state,
      events: [...(row.institutionalEvents as unknown[]), ...(state.events as unknown[])],
      version: Number(version?.version ?? 0),
      id: row._id,
      record: {},
    });
  }
  return result;
}

export type BaselineReport = {
  contexts: number;
  comparisons: number;
  unavailableCounts: number;
  layoutErrors: number;
  reviewSupportErrors: number;
  readinessContexts: number;
  readinessDigest: string;
  countDigest: string;
  layoutDigest: string;
  reviewSupportDigest: string;
  historyAnalyses: number;
  historyCandidates: number;
  historyArchiveDigest: string;
  savedReviewTextPolicy: string;
};

/**
 * baselineRoot must point to the original source archive, not the working tree.
 * Stored reviews are compared verbatim by the invariant audit. Their old display
 * substitutions are deliberately excluded: schema 2 displays the saved text.
 */
export async function verifyBaselineEquivalence(
  source: Snapshot,
  canonical: Snapshot,
  baselineRoot: string,
  runtimeRoot = process.cwd(),
): Promise<BaselineReport> {
  if (resolve(baselineRoot) === resolve(runtimeRoot))
    throw Error('Baseline deve ser uma cópia imutável distinta do runtime.');
  verifyCanonicalEquivalence(source, canonical);
  const [oldRules, newRules] = await Promise.all([load(baselineRoot), load(runtimeRoot)]);
  const oldCases = cases(source, oldRules, false),
    newCases = cases(canonical, newRules, false, true);
  // Also check the current editor against the live catalogue (distinct from saved snapshots).
  const currentCount = source.calendarContents?.length ?? 0;
  const oldLive = cases(source, oldRules, true).slice(0, currentCount),
    newLive = cases(canonical, newRules, true, true).slice(0, currentCount);
  oldCases.push(...oldLive);
  newCases.push(...newLive);
  compare(oldCases.length, newCases.length, 'quantidade de contextos');
  const counts: string[] = [],
    layouts: string[] = [],
    reviews: string[] = [];
  let unavailableCounts = 0,
    layoutErrors = 0,
    reviewSupportErrors = 0;
  for (let i = 0; i < oldCases.length; i++) {
    const before = oldCases[i],
      after = newCases[i];
    compare(before.id, after.id, 'identidade do contexto');
    const oldCount = attempt(() => oldRules.count(before.state, before.events));
    const newCount = attempt(() => newRules.count(after.state, after.events));
    compare(oldCount, newCount, `contagem no contexto ${i}`);
    if (oldCount.error) unavailableCounts++;
    counts.push(fingerprint(oldCount));
    const oldLayout = attempt(() =>
      oldRules.layout(before.state, before.events, oldCount.value, before.record),
    );
    const newLayout = attempt(() =>
      newRules.layout(after.state, after.events, newCount.value, after.record),
    );
    compare(oldLayout, newLayout, `apresentação no contexto ${i}`);
    if (oldLayout.error || newLayout.error) layoutErrors++;
    layouts.push(fingerprint(oldLayout));
    const input = (item: Case) => ({
      ...item.record,
      id: item.id,
      name: 'Calendário',
      version: item.version,
      state: item.state,
    });
    const oldReview = attempt(() => oldRules.review(input(before), before.events));
    const newReview = attempt(() => newRules.review(input(after), after.events));
    compare(oldReview, newReview, `apoio ao parecer no contexto ${i}`);
    if (oldReview.error || newReview.error) reviewSupportErrors++;
    reviews.push(fingerprint(oldReview));
  }
  if (layoutErrors || reviewSupportErrors)
    throw Error(
      `Baseline incompleto: ${layoutErrors} erros de apresentação e ${reviewSupportErrors} erros de apoio ao parecer.`,
    );
  const readiness: string[] = [];
  for (let i = 0; i < currentCount; i++) {
    const before = oldCases[i],
      after = newCases[i];
    const input = (item: Case) => ({ ...item.record, id: item.record._id, state: item.state });
    const db = (snapshot: Snapshot, year: unknown) => ({
      catalogue: {
        revision: snapshot.catalogueRevisions?.find((row) => row.year === year)?.revision ?? 1,
      },
      reviews: snapshot.reviews ?? [],
    });
    const previous = attempt(() =>
      oldRules.readiness(input(before), db(source, before.state.year)),
    );
    const current = attempt(() =>
      newRules.readiness(input(after), db(canonical, after.state.year)),
    );
    compare(previous, current, `liberação no contexto ${i}`);
    if (previous.error || current.error)
      throw Error(`Baseline incompleto: erro de liberação no contexto ${i}.`);
    readiness.push(fingerprint(previous));
  }
  const history = verifyHistoryArchive(source, canonical);
  return {
    contexts: oldCases.length,
    comparisons: oldCases.length * 3 + currentCount + history.historyAnalyses,
    unavailableCounts,
    layoutErrors,
    reviewSupportErrors,
    readinessContexts: currentCount,
    readinessDigest: fingerprint(readiness),
    countDigest: fingerprint(counts),
    layoutDigest: fingerprint(layouts),
    reviewSupportDigest: fingerprint(reviews),
    ...history,
    savedReviewTextPolicy:
      'Reviews e revisões preservados integralmente; apresentação exibe o texto salvo, sem substituições antigas.',
  };
}

/** Retired source documents and their immutable analyses remain part of the data audit. */
export function verifyHistoryArchive(source: Snapshot, canonical: Snapshot) {
  const histories = new Map((source.histories ?? []).map((row) => [row._id, row]));
  const archived = new Map((canonical.histories ?? []).map((row) => [row._id, row]));
  const analyses = new Map((canonical.historyAnalyses ?? []).map((row) => [row._id, row]));
  if (histories.size !== archived.size || (source.historyAnalyses ?? []).length !== analyses.size)
    throw Error('Arquivo histórico divergente.');
  for (const [id, history] of histories)
    compare(history, archived.get(id), 'registro histórico arquivado');
  let historyCandidates = 0;
  const fingerprints: string[] = [];
  for (const analysis of source.historyAnalyses ?? []) {
    if (!histories.has(String(analysis.historyId)))
      throw Error('Referência ausente no arquivo histórico.');
    const migrated = analyses.get(analysis._id);
    compare(analysis, migrated, 'análise histórica arquivada');
    const candidates = record(analysis.analysis).candidates;
    if (!Array.isArray(candidates)) throw Error('Lista de candidatos históricos inválida.');
    historyCandidates += candidates.length;
    fingerprints.push(fingerprint(analysis));
  }
  return {
    historyAnalyses: (source.historyAnalyses ?? []).length,
    historyCandidates,
    historyArchiveDigest: fingerprint({ histories: [...histories], analyses: fingerprints }),
  };
}
