import { equalValues } from '../../shared/equal.ts';
import { readCalendarOfferInput } from './normalization/input.ts';
import { applicableEvents, inspectCalendar, type BaseDocument } from './base.ts';
import type { CatalogueEvent } from '../institution/catalogue.ts';
import { readActivityDates, readCalendarDates } from './civil-dates.ts';
import { isEditable, isPublished, type CalendarStatus } from './lifecycle.ts';
import type { InstitutionalEventSnapshot } from './model.ts';
import { prepareOfferCalendarSave } from './prepare-save.ts';
import { rulesetVersion } from '../policies/registry.ts';

export interface RehearsalCalendar {
  status: CalendarStatus;
  year: number;
  campus: string;
  state: Record<string, unknown>;
  catalogueRevision: number;
  institutionalSnapshot: Record<string, unknown>[];
  documentSnapshot: BaseDocument[];
}
export interface RehearsalBase {
  revision: number;
  events: CatalogueEvent[];
  documents: BaseDocument[];
}
/** A difference between what is stored and what a save would write, under a collapsed path. */
export interface RehearsalChange {
  path: string;
  before: unknown;
  after: unknown;
}
export type RehearsalResult =
  | { outcome: 'saves'; changed: RehearsalChange[] }
  | { outcome: 'fails'; error: string }
  | { outcome: 'unaffected' }
  | { outcome: 'needs-return' };

/**
 * What every save records on its own: the rules in force. Anything else that differs is content
 * stored in a form the current code no longer writes.
 */
export const expectedRehearsalChanges: ReadonlySet<string> = new Set(['rulesetVersion']);

/** What differs, one entry per path, with list positions collapsed: `periods[].end`. */
function changedPaths(before: unknown, after: unknown, path = ''): RehearsalChange[] {
  if (equalValues(before, after)) return [];
  if (Array.isArray(before) && Array.isArray(after) && before.length === after.length) {
    const seen = new Map<string, RehearsalChange>();
    for (const [i, item] of before.entries())
      for (const change of changedPaths(item, after[i], `${path}[]`))
        if (!seen.has(change.path)) seen.set(change.path, change);
    return [...seen.values()];
  }
  if (before && after && typeof before === 'object' && typeof after === 'object') {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...keys].flatMap((key) =>
      changedPaths(
        (before as Record<string, unknown>)[key],
        (after as Record<string, unknown>)[key],
        path ? `${path}.${key}` : key,
      ),
    );
  }
  return [{ path, before, after }];
}

/**
 * Runs one stored calendar through the checks a real save goes through, with the rules of the code
 * being released: a calendar in editing must keep saving with no action from the campus.
 */
export function rehearseCalendar(
  calendar: RehearsalCalendar,
  base: RehearsalBase,
): RehearsalResult {
  // A published calendar reads only the base frozen with it, and there is nothing to return.
  if (isPublished(calendar.status)) return { outcome: 'unaffected' };
  const stored = JSON.parse(JSON.stringify(calendar.state)) as Record<string, unknown>;
  try {
    const state = {
      ...(readCalendarDates(calendar.state as never) as object),
      year: calendar.year,
      campus: calendar.campus,
    } as unknown as Parameters<typeof applicableEvents>[1] & Parameters<typeof rulesetVersion>[0];
    const assessment = inspectCalendar(
      {
        status: calendar.status,
        state,
        catalogueRevision: calendar.catalogueRevision,
        institutionalSnapshot: calendar.institutionalSnapshot.map((event) =>
          readActivityDates(event as never),
        ) as InstitutionalEventSnapshot[],
        documentSnapshot: calendar.documentSnapshot,
      },
      {
        currentCatalogueRevision: base.revision,
        institutionalEvents: applicableEvents(base, state) as InstitutionalEventSnapshot[],
        currentDocuments: base.documents,
        currentRulesetVersion: rulesetVersion(state),
      },
    );
    if (!isEditable(calendar.status))
      return { outcome: assessment.compatible ? 'unaffected' : 'needs-return' };
    const prepared = prepareOfferCalendarSave(
      state as never,
      readCalendarOfferInput({ ...state, rulesetVersion: rulesetVersion(state) }) as never,
      {
        storedContent: stored,
        catalogue: base as never,
        allowOfferRemoval: calendar.status === 'rascunho',
      },
    );
    return {
      outcome: 'saves',
      changed: changedPaths(stored, JSON.parse(JSON.stringify(prepared.content))),
    };
  } catch (cause) {
    return { outcome: 'fails', error: cause instanceof Error ? cause.message : String(cause) };
  }
}
