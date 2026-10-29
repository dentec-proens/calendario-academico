import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { CalendarContentV4 } from '../src/domain/calendar/model';
import { policyFor } from '../src/domain/policies/registry';

/** Stable object ordering for the pre-conversion audit fingerprint. */
export function canonicalMigrationState(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalMigrationState).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalMigrationState(item)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

export const migrationStateHash = (value: unknown) =>
  bytesToHex(sha256(new TextEncoder().encode(canonicalMigrationState(value))));

/** Preserved configuration gaps, not a substitute for the M7 equivalence verifier. */
export function migrationPending(state: CalendarContentV4, year: number): boolean {
  const policy = policyFor(year);
  return state.offers.some(
    (offer) =>
      offer.organization === 'a-classificar' ||
      (!policy.excludes(offer) && offer.stages === undefined) ||
      Object.values(offer.intake ?? {}).some((intake) => intake.status === 'unknown'),
  );
}
