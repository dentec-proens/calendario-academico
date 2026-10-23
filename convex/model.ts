import type { Doc } from './_generated/dataModel';
import type { Value } from 'convex/values';

export const entityTables = [
  'users',
  'campuses',
  'calendars',
  'histories',
  'audit',
  'sessions',
  'loginAttempts',
  'invitations',
  'passwordResets',
  'recoveryAttempts',
  'uploads',
  'documents',
  'reviews',
] as const;

export type EntityTable = (typeof entityTables)[number];

export function isEntityTable(field: string): field is EntityTable {
  return (entityTables as readonly string[]).includes(field);
}

export const identityFields: Partial<Record<EntityTable, string>> = {
  users: 'id',
  campuses: 'id',
  calendars: 'id',
  histories: 'id',
  sessions: 'id',
  loginAttempts: 'id',
  invitations: 'tokenHash',
  passwordResets: 'hash',
  recoveryAttempts: 'key',
  uploads: 'id',
  documents: 'id',
  reviews: 'calendarId',
};

// The snapshot codec is the compatibility boundary for the existing calendar
// domain. Convex owns transactions and reactive invalidation; no bridge tokens
// or application-managed collection revisions are needed here.
export type EncodedValue = {
  data: Value;
  undefinedPaths: string[][];
};

export type SnapshotOptions = {
  fields?: string[];
  calendarId?: string;
  campusId?: string;
  userId?: string;
  email?: string;
  full?: boolean;
  summary?: boolean;
  appendOnlyAudit?: boolean;
};

export type EntityKey = { key: string; position: number };
export type SnapshotKeys = Record<string, EntityKey[]>;
export type EntityUpsert = {
  key: string;
  position: number | null;
  value: EncodedValue;
};
export type SnapshotChange = {
  field: string;
  removeRoot?: boolean;
  value?: EncodedValue;
  upserts?: EntityUpsert[];
  deleteKeys?: string[];
};

export type EntityRow = Doc<EntityTable>;
