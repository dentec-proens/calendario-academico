import {
  convertCatalogueEventV5,
  convertContentV5,
  provenScopeIds,
} from '../../src/domain/calendar/migration/convert-v5.ts';
import type { V4Case, V4CatalogueRow, V4Content, V4Submission } from './v4-fixtures.ts';

/**
 * Frozen v4 documents converted to the current format (phase 2, step 5 onwards). The result
 * keeps the JSON typing of the frozen fixtures; tests cast it where they call domain code.
 */
export const convertedContent = (item: V4Case): V4Content =>
  convertContentV5(item.content, { year: item.year, submissions: item.submissions })!
    .document as unknown as V4Content;

/** A submission converted as the migration does, with the lists of the content it proves. */
export const convertedSubmission = (item: V4Case, submission: V4Submission): V4Submission =>
  convertContentV5(submission, {
    year: item.year,
    source: 'submission',
    provenScopes: provenScopeIds(
      convertContentV5(item.content, { year: item.year, submissions: item.submissions })!.manifest,
      submission.sequence,
    ),
  })!.document as unknown as V4Submission;

export const convertedCatalogueRow = (row: V4CatalogueRow): V4CatalogueRow =>
  convertCatalogueEventV5(row)!.document as unknown as V4CatalogueRow;

/**
 * A bare v4 state, as older oracle inputs keep it (with `year` and `campus` beside the stored
 * fields), converted through a content document with an empty base.
 */
export function convertedState<T extends { year: number; campus?: string }>(input: T): T {
  const { year, campus, ...state } = input;
  const content = convertContentV5(
    {
      calendarId: 'fixture',
      state,
      catalogueRevision: 0,
      institutionalSnapshot: [],
      documentSnapshot: [],
    },
    { year },
  )!.document as { state: object };
  return { ...content.state, year, ...(campus === undefined ? {} : { campus }) } as T;
}

/** Catalogue events of older oracles (`id` in place of the stored `code`), converted as rows. */
export function convertedCatalogueEvents<T extends { id: string; start: string }>(
  events: readonly T[],
): T[] {
  return events.map(({ id, ...event }) => {
    const {
      code,
      year: _year,
      ...row
    } = convertCatalogueEventV5({
      code: id,
      year: Number(event.start.slice(0, 4)),
      ...event,
    })!.document;
    return { id: code, ...row } as unknown as T;
  });
}
