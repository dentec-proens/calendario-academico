import type { QueryCtx, MutationCtx } from '../_generated/server';
import { ConvexError } from 'convex/values';
import { DomainError } from '../../src/domain/errors';

export type Context = QueryCtx | MutationCtx;

export function fail(message: string, status = 400): never {
  throw new ConvexError({ status, error: message });
}

/** Runs domain rules, turning their violations into the client-facing error contract. */
export function domainRule<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof DomainError) fail(error.message, error.status);
    throw error;
  }
}

export const iso = (at: number) => new Date(at).toISOString();

export function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function text(value: string, maximum = 240) {
  if (!value.trim() || value.length > maximum) fail('Campo obrigatório ou texto muito longo.');
  return value.trim();
}
