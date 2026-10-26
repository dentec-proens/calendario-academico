import { inheritedEvents } from '../institution.ts';
import { campusInstitutionalEvents, teacherDayId } from '../teacher-day.ts';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { equalValues } from '../equal.ts';
import type { CalendarActivity } from '../domain-types.ts';
import { rulesetVersion } from '../calendar-rules/index.ts';

export type BaseEvent = CalendarActivity & { source?: string };
export interface BaseDocument {
  id: string;
  year: number;
  type: string;
  title: string;
  source: string;
  hash: string;
  filename: string;
}
export interface BaseSnapshot<
  E extends BaseEvent = BaseEvent,
  D extends BaseDocument = BaseDocument,
> {
  revision: number;
  events: E[];
  documents: D[];
  rulesetVersion?: string;
}
export interface BaseScope {
  year: number;
  modalities?: string[];
  offer?: string;
  rulesetVersion?: string;
}

function eventContent(event: BaseEvent, scope: BaseScope) {
  return {
    id: event.id,
    name: event.name,
    start: event.originalStart ?? event.start,
    end: event.originalEnd ?? event.end,
    kind: event.kind,
    category: event.category ?? '',
    evidence: event.evidence,
    source: event.source ?? '',
    requirementId: event.requirementId ?? '',
    hours: event.hours ?? null,
    modalities: [
      ...new Set(
        (event.modalities ?? scope.modalities ?? [scope.offer ?? '']).filter((item) =>
          (scope.modalities ?? [scope.offer ?? item]).includes(item),
        ),
      ),
    ].sort(),
  };
}
function documentContent(document: BaseDocument) {
  const { id, year, type, title, source, hash, filename } = document;
  return { id, year, type, title, source, hash, filename };
}
function ordered<T extends { id: string }>(items: T[]) {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
function changes<T extends { id: string }>(before: T[], after: T[], content: (item: T) => unknown) {
  const previous = new Map(before.map((item) => [item.id, item]));
  const current = new Map(after.map((item) => [item.id, item]));
  return {
    added: ordered(after.filter((item) => !previous.has(item.id))),
    removed: ordered(before.filter((item) => !current.has(item.id))),
    changed: ordered(after).flatMap((item) => {
      const old = previous.get(item.id);
      return old && !equalValues(content(old), content(item)) ? [{ before: old, after: item }] : [];
    }),
  };
}
function hasChanges(diff: { added: unknown[]; removed: unknown[]; changed: unknown[] }) {
  return diff.added.length + diff.removed.length + diff.changed.length > 0;
}
function identity(snapshot: BaseSnapshot, scope: BaseScope) {
  return (
    (snapshot.rulesetVersion?.startsWith('consup-292-2027-')
      ? `base-v2:${snapshot.rulesetVersion}:`
      : 'base-v1:') +
    bytesToHex(
      sha256(
        new TextEncoder().encode(
          JSON.stringify({
            year: scope.year,
            modalities: [...new Set(scope.modalities ?? [scope.offer ?? ''])].sort(),
            events: ordered(snapshot.events).map((event) => eventContent(event, scope)),
            documents: ordered(snapshot.documents).map(documentContent),
          }),
        ),
      ),
    )
  );
}

/** The only policy for institutional-base equivalence and confirmation. Revision is a concurrency marker, not content. */
export function inspect<E extends BaseEvent, D extends BaseDocument>(
  previous: BaseSnapshot<E, D>,
  current: BaseSnapshot<E, D>,
  scope: BaseScope,
) {
  const events = changes(previous.events, current.events, (event) => eventContent(event, scope));
  const documents = changes(previous.documents, current.documents, documentContent);
  const rules = {
    before: previous.rulesetVersion,
    after: current.rulesetVersion,
    changed:
      current.rulesetVersion?.startsWith('consup-292-2027-') === true &&
      previous.rulesetVersion !== current.rulesetVersion,
  };
  const kind = rules.changed
    ? 'rules'
    : hasChanges(events)
      ? 'events'
      : hasChanges(documents)
        ? 'documents'
        : previous.revision === current.revision
          ? 'current'
          : 'equivalent';
  return {
    kind,
    compatible: kind === 'current' || kind === 'equivalent',
    identity: identity(current, scope),
    rules,
    events,
    documents,
  };
}

/** An acceptance is tied to the exact applicable content presented, even if another revision arrives. */
export function reconcile(assessment: ReturnType<typeof inspect>, acceptance?: string) {
  if (acceptance !== undefined && acceptance !== assessment.identity)
    throw new Error(
      'A base institucional mudou desde a comparação. Confira as mudanças novamente.',
    );
  if (!assessment.compatible && acceptance === undefined)
    throw new Error(
      'Há mudanças aplicáveis na base institucional. Confira e incorpore antes de salvar.',
    );
  return { incorporate: !assessment.compatible, recalculate: hasChanges(assessment.events) };
}

export function reviewIsCurrent(
  review:
    | {
        calendarVersion: number;
        catalogueRevision: number;
        baseIdentity?: string;
        rulesetVersion?: string;
      }
    | null
    | undefined,
  calendarVersion: number | undefined,
  current: { revision: number; identity?: string; rulesetVersion?: string },
) {
  const declaredRules =
    current.rulesetVersion ??
    (current.identity?.startsWith('base-v2:') ? current.identity.split(':')[1] : undefined);
  const requiredRules = declaredRules?.startsWith('consup-292-2027-') ? declaredRules : undefined;
  return Boolean(
    review &&
    (!requiredRules || review.rulesetVersion === requiredRules) &&
    review.calendarVersion === calendarVersion &&
    (review.baseIdentity && current.identity
      ? review.baseIdentity === current.identity
      : review.catalogueRevision === current.revision),
  );
}

/** Read the same assessment from persisted calendar records in either adapter. */
export function inspectCalendar<E extends BaseEvent, D extends BaseDocument>(
  record: {
    state: BaseScope;
    catalogueRevision: number;
    institutionalSnapshot: E[];
    documentSnapshot: D[];
  },
  latest: {
    currentCatalogueRevision: number;
    institutionalEvents: E[];
    currentDocuments: D[];
    currentRulesetVersion?: string;
  },
) {
  return inspect(
    {
      revision: record.catalogueRevision,
      events: record.institutionalSnapshot,
      documents: record.documentSnapshot,
      rulesetVersion: record.state.rulesetVersion,
    },
    {
      revision: latest.currentCatalogueRevision,
      events: latest.institutionalEvents,
      documents: latest.currentDocuments,
      rulesetVersion: latest.currentRulesetVersion ?? rulesetVersion(record.state),
    },
    record.state,
  );
}

/** Minimal legacy records do not contain enough evidence to infer semantic equivalence. */
export function referenceIsCurrent(
  previousRevision: number,
  currentRevision: number,
  assessment?: { compatible: boolean },
) {
  return assessment ? assessment.compatible : previousRevision === currentRevision;
}

/** Inspect removals even when a campus adjustment refers to an event no longer published.
 * Applying the calendar still validates that adjustment through the normal commands. */
export function applicableEvents<T extends BaseEvent & { active: boolean }>(
  catalogue: { events: T[] },
  scope: BaseScope & { teacherDayDate?: string | null },
) {
  const published = inheritedEvents(catalogue, scope.year, scope.modalities ?? [scope.offer ?? '']);
  return published.some((event) => event.id === teacherDayId)
    ? campusInstitutionalEvents(published, scope)
    : published;
}
