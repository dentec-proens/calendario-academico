import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Stored v4 documents frozen as JSON (phase 2, step 1 of
 * `docs/plans/2026-11-02-atividades-e-datas.md`). The data is typed only as JSON so it survives
 * the renames and format changes of phase 2; tests that call domain code cast it at the call.
 */
export interface V4Case {
  name: string;
  source: string;
  year: number;
  campus: string;
  content: V4Content;
  submissions: V4Submission[];
}
export interface V4Content {
  calendarId: string;
  state: V4State;
  catalogueRevision: number;
  institutionalSnapshot: Record<string, unknown>[];
  documentSnapshot: Record<string, unknown>[];
}
export type V4State = Record<string, unknown> & {
  offers: Record<string, unknown>[];
  events: Record<string, unknown>[];
};
export type V4Submission = Omit<V4Content, 'calendarId'> & {
  calendarId: string;
  sequence: number;
  contentVersion: number;
  contentHash: string;
  [key: string]: unknown;
};
export interface V4CatalogueRow extends Record<string, unknown> {
  code: string;
  year: number;
}

const read = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../fixtures/v4/${name}`, import.meta.url), 'utf8')) as T;

export const v4Cases = (): V4Case[] => read<{ cases: V4Case[] }>('contents.json').cases;

export const v4CatalogueRows = (): V4CatalogueRow[] =>
  read<{ rows: V4CatalogueRow[] }>('institutional-events.json').rows;

export const oracleFile = 'oracle-before.json';

export const readOracle = <T>(): T => read<T>(oracleFile);

export function writeOracle(value: unknown) {
  writeFileSync(
    new URL(`../fixtures/v4/${oracleFile}`, import.meta.url),
    JSON.stringify(value, null, 2) + '\n',
  );
}
