import { policyFor } from '../policies/registry.ts';

// Citation only. This module does not change calendar criteria or deadlines.
export function reviewNorm(year: number | string, fallback = '') {
  return policyFor(year).review.citation ?? fallback;
}
