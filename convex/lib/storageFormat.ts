import type { Infer } from 'convex/values';
import type { Doc } from '../_generated/dataModel';
import type { contentState, institutionalEventSnapshot } from '../validators';
import { maintenanceMessage } from './maintenance';
import { fail } from './shared';

/**
 * Readers of the widened storage (plan `docs/plans/2026-11-02-atividades-e-datas.md`, phase 2,
 * step 17a). Until the migration converts every document, a calendar content, a submission or a
 * catalogue row may still be in the v4 format: it is never read, adapted or cast, and the reader
 * answers the same operational unavailability as maintenance (503). Authentication and the
 * maintenance query never read these tables. Contraction (release step 7) removes this module
 * with the v4 variants of the schema.
 */
export function formatUnavailable(): never {
  fail(maintenanceMessage, 503);
}

type Snapshot = Infer<typeof institutionalEventSnapshot>;
type Stored = Doc<'calendarContents'> | Doc<'calendarSubmissions'>;
type Current<T extends Stored> = Omit<T, 'state' | 'institutionalSnapshot'> & {
  state: Infer<typeof contentState>;
  institutionalSnapshot: Snapshot[];
};

/** The v5 content of a stored calendar content or submission; v4 answers unavailability. */
export function currentFormat<T extends Stored>(row: T): Current<T> {
  const { state: stored, institutionalSnapshot: snapshot, ...fields } = row;
  const state: Stored['state'] = stored;
  if (state.schemaVersion !== 5) formatUnavailable();
  const events: ReadonlyArray<Stored['institutionalSnapshot'][number]> = snapshot;
  const institutionalSnapshot = events.map((event) =>
    'effect' in event ? event : formatUnavailable(),
  );
  return { ...fields, state, institutionalSnapshot };
}

/** A v5 catalogue row; a v4 row answers unavailability. */
export function currentCatalogueRow(row: Doc<'institutionalEvents'>) {
  if (!('effect' in row)) formatUnavailable();
  return row;
}
