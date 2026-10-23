import type { reviews as nativeReviews } from '../../web/native/client.ts';
import type { Id } from '../../convex/_generated/dataModel.js';
import { api } from '../../convex/_generated/api.js';
import { reviewSupport, initialConclusion } from '../../src/review.ts';

type Support = Awaited<ReturnType<typeof nativeReviews.get>>;
const support = reviewSupport(
  {
    id: 'synthetic-review',
    name: '2027 — Campus de teste',
    version: 1,
    state: {
      year: 2027,
      campus: 'Campus de teste',
      offer: 'integrado',
      regime: 'anual',
      weekdays: [],
      weekConfirmed: false,
      periods: [],
      events: [],
    },
  },
  [],
);
const initial = {
  ...support,
  catalogueRevision: 1,
  initialConclusion: initialConclusion(support),
  review: null,
  stale: false,
} as Support;
let snapshot = structuredClone(initial);
const calls = { saves: 0, failSave: false };

export const reviews: typeof nativeReviews = {
  get: () => Promise.resolve(structuredClone(snapshot)),
  save: (_id, body) => {
    calls.saves++;
    if (calls.failSave) return Promise.reject(new Error('Falha sintética ao salvar.'));
    snapshot.review = {
      calendarId: snapshot.calendar.id,
      calendarVersion: body.calendarVersion,
      catalogueRevision: body.catalogueRevision,
      revision: body.revision + 1,
      entries: structuredClone(body.entries),
      conclusion: body.conclusion,
      processNumber: body.processNumber ?? '',
      applicableNorm: body.applicableNorm ?? '',
      source: 'SEI 3959640',
      documentSnapshot: [],
      officialApproval: false,
      reviewer: { id: 'synthetic-reviewer' as Id<'users'>, name: 'Parecerista de teste' },
      updatedAt: '2026-10-23T15:00:00Z',
    };
    return Promise.resolve({ revision: snapshot.review.revision });
  },
  export: () => Promise.resolve({ html: '', body: '', text: '' }),
};
export const functions = api;
export const nativeError = (cause: unknown) =>
  cause instanceof Error ? cause : new Error(String(cause));
window.reviewUiTest = { calls };
declare global {
  interface Window {
    reviewUiTest: { calls: typeof calls };
  }
}
