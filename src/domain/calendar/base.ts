import { inheritedEvents } from '../institution/catalogue.ts';
import { applyObservances, type ObservanceState } from './observances.ts';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { equalValues } from '../../shared/equal.ts';
import type { CalendarActivity, CalendarOffer } from './model.ts';
import { kinds } from './offers.ts';
import { DomainError } from '../errors.ts';
import {
  bindsRuleset,
  equivalentRulesets,
  reviewBoundary,
  rulesetChangesBetween,
  rulesetVersion,
} from '../policies/registry.ts';

export type BaseEvent = CalendarActivity & {
  evidence?: string;
  source?: string;
  modalities?: string[];
};
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
  rulesetVersion?: string;
  offers: CalendarOffer[];
}

const scopeKinds = (scope: BaseScope): string[] => kinds({ offers: scope.offers });

function eventKinds(event: BaseEvent, scope: BaseScope): string[] {
  if (event.offers)
    return scope.offers
      .filter((offer) => event.offers!.includes(offer.id))
      .map((offer) => offer.kind);
  return event.modalities ?? scopeKinds(scope);
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
      ...new Set(eventKinds(event, scope).filter((item) => scopeKinds(scope).includes(item))),
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
    (bindsRuleset(snapshot.rulesetVersion)
      ? `base-v2:${reviewBoundary(snapshot.rulesetVersion)}:`
      : 'base-v1:') +
    bytesToHex(
      sha256(
        new TextEncoder().encode(
          JSON.stringify({
            year: scope.year,
            modalities: [...new Set(scopeKinds(scope))].sort(),
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
      bindsRuleset(current.rulesetVersion) &&
      !equivalentRulesets(previous.rulesetVersion, current.rulesetVersion),
    changes: rulesetChangesBetween(previous.rulesetVersion, current.rulesetVersion),
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
    throw new DomainError(
      'A base institucional mudou desde a comparação. Confira as mudanças novamente.',
      409,
    );
  if (!assessment.compatible && acceptance === undefined)
    throw new DomainError(
      'Há mudanças aplicáveis na base institucional. Confira e incorpore antes de salvar.',
      409,
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
  const requiredRules = bindsRuleset(declaredRules) ? declaredRules : undefined;
  return Boolean(
    review &&
    (!requiredRules || equivalentRulesets(review.rulesetVersion, requiredRules)) &&
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
  scope: BaseScope & ObservanceState,
) {
  const published = inheritedEvents(catalogue, scope.year, scope.offers);
  return applyObservances(published, scope);
}
