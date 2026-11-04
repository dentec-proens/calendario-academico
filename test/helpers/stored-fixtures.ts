import { readFileSync } from 'node:fs';

/**
 * Stored calendar documents, frozen as JSON (`test/fixtures/stored/`): the documents of the format 4
 * fixtures (the Ivaiporã and Cascavel drafts, among others) as the format 5 migration left them,
 * with every offer organized and every period associated by the rules of the format 6 converter.
 * The data is typed only as JSON; tests that call domain code cast it.
 */
export interface StoredCase {
  name: string;
  source: string;
  year: number;
  campus: string;
  content: StoredContent;
  submissions: StoredSubmission[];
}
export interface StoredContent {
  calendarId: string;
  state: StoredState;
  catalogueRevision: number;
  institutionalSnapshot: Record<string, unknown>[];
  documentSnapshot: Record<string, unknown>[];
}
export type StoredState = Record<string, unknown> & {
  offers: Record<string, unknown>[];
  events: Record<string, unknown>[];
};
export type StoredSubmission = Omit<StoredContent, 'calendarId'> & {
  calendarId: string;
  sequence: number;
  contentVersion: number;
  contentHash: string;
  [key: string]: unknown;
};
export interface StoredCatalogueRow extends Record<string, unknown> {
  code: string;
  year: number;
}

const read = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../fixtures/stored/${name}`, import.meta.url), 'utf8')) as T;

export const storedCases = (): StoredCase[] => read<{ cases: StoredCase[] }>('contents.json').cases;

export const storedCatalogueRows = (): StoredCatalogueRow[] =>
  read<{ rows: StoredCatalogueRow[] }>('institutional-events.json').rows;
