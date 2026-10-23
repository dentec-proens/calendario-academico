export type Row = { _id: string; _creationTime: number; [field: string]: unknown };
export type Snapshot = Record<string, Row[]>;
export type Document = Record<string, unknown>;
export type Operation =
  | { kind: 'replace'; table: string; id: string; document: Document }
  | { kind: 'insert'; table: string; document: Document }
  | { kind: 'delete'; table: string; id: string };

export type MigrationPlan = {
  format: 1;
  sourceDigest: string;
  digest: string;
  tables: string[];
  sourceCounts: Record<string, number>;
  sourceFingerprints: Record<string, string>;
  expectedCounts: Record<string, number>;
  fingerprints: Record<string, string>;
  batches: { digest: string; operations: Operation[] }[];
  missingFiles: { table: string; id: string; filename: string }[];
};
