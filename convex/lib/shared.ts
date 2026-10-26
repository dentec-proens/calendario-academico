import type { QueryCtx, MutationCtx } from '../_generated/server';
import { ConvexError } from 'convex/values';

export type Context = QueryCtx | MutationCtx;

export function fail(message: string, status = 400): never {
  throw new ConvexError({ status, error: message });
}

export const iso = (at: number) => new Date(at).toISOString();

export function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function text(value: string, maximum = 240) {
  if (!value.trim() || value.length > maximum) fail('Campo obrigatório ou texto muito longo.');
  return value.trim();
}
