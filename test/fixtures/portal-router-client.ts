import type * as native from '../../web/native/client.ts';
import { api } from '../../convex/_generated/api.js';
import type { Id } from '../../convex/_generated/dataModel.js';
import { initialConclusion, reviewSupport } from '../../src/review.ts';
import { getFunctionName, type FunctionReference } from 'convex/server';

export function portalReview(id: string): Awaited<ReturnType<typeof native.reviews.get>> {
  if (!['calendar-a', 'calendar-b', 'calendar-offpage'].includes(id))
    throw new Error('Calendário não encontrado.');
  const support = reviewSupport(
    {
      id,
      name: id === 'calendar-a' ? 'Calendário de teste' : `Calendário ${id}`,
      version: 1,
      state: {
        year: 2027,
        campus: 'Campus de teste',
        offer: 'integrado',
        modalities: ['integrado'],
        regime: 'anual',
        weekdays: [],
        weekConfirmed: false,
        periods: [],
        events: [],
      },
    },
    [],
  );
  return {
    ...support,
    calendar: { ...support.calendar, id: id as Id<'calendars'> },
    catalogueRevision: 1,
    initialConclusion: initialConclusion(support),
    review: null,
    stale: false,
  } as Awaited<ReturnType<typeof native.reviews.get>>;
}

// Explicit failures keep accidental writes or unimplemented flows local and visible.
function unavailable<T extends object>(name: string): T {
  return new Proxy({} as T, {
    get: (_target, method) => () =>
      Promise.reject(new Error(`Operação sintética não implementada: ${name}.${String(method)}`)),
  });
}

export const functions = api;
export const convex = new Proxy(unavailable<typeof native.convex>('convex'), {
  get(target, method) {
    if (method === 'mutation')
      return (reference: FunctionReference<'mutation'>) => {
        if (getFunctionName(reference) === 'nativeFiles:issueUpload')
          return Promise.resolve({
            uploadId: 'synthetic-upload',
            uploadUrl: window.location.origin + '/__synthetic-upload',
          });
        return Promise.reject(new Error('Mutação sintética não implementada.'));
      };
    if (method === 'action')
      return (reference: FunctionReference<'action'>) => {
        if (getFunctionName(reference) === 'nativeActions:completeUpload')
          return Promise.resolve({ uploadId: 'synthetic-upload' });
        return Promise.reject(new Error('Action sintética não implementada.'));
      };
    return Reflect.get(target, method);
  },
});
export const accounts = unavailable<typeof native.accounts>('accounts');
export const calendars = unavailable<typeof native.calendars>('calendars');
const unavailableInstitution = unavailable<typeof native.institution>('institution');
export const institution: typeof native.institution = {
  createCampus: (name) =>
    finishMutation('createCampus', {
      id: 'created-campus' as Id<'campuses'>,
      name,
      archived: false,
    }),
  uploadDocument: (body) =>
    finishMutation('uploadDocument', {
      ...body,
      id: 'created-document' as Id<'documents'>,
      hash: 'a'.repeat(64),
      status: 'rascunho',
      version: 1,
      createdAt: '2026-10-26T12:00:00Z',
    } as Awaited<ReturnType<typeof native.institution.uploadDocument>>),
  saveCatalogue: unavailableInstitution.saveCatalogue,
  restoreDocumentOriginal: unavailableInstitution.restoreDocumentOriginal,
  documentStatus: unavailableInstitution.documentStatus,
};
const unavailableReviews = unavailable<typeof native.reviews>('reviews');
let resolvePending: ((value: ReturnType<typeof portalReview>) => void) | undefined;
let resolvePendingMutation: (() => void) | undefined;
async function finishMutation<T>(operation: string, result: T): Promise<T> {
  if (window.portalRouterTest.deferNextMutation) {
    window.portalRouterTest.deferNextMutation = false;
    window.portalRouterTest.pendingMutation = operation;
    await new Promise<void>((resolve) => {
      resolvePendingMutation = resolve;
    });
  }
  window.portalRouterTest.completedMutation = operation;
  return result;
}
window.portalRouterTest = {
  deferNextReview: false,
  deferNextMutation: false,
  pendingMutation: null,
  completedMutation: null,
  removeCalendar: (_id: string) => {
    throw new Error('Fixture de calendários ainda não iniciada.');
  },
  pendingReviewId: null,
  resolvePendingMutation() {
    if (!resolvePendingMutation) throw new Error('Nenhuma mutação sintética pendente.');
    resolvePendingMutation();
    resolvePendingMutation = undefined;
    this.pendingMutation = null;
  },
  resolvePendingReview() {
    const id = this.pendingReviewId;
    if (!id || !resolvePending) throw new Error('Nenhuma revisão sintética pendente.');
    resolvePending(portalReview(id));
    resolvePending = undefined;
    this.pendingReviewId = null;
  },
};
export const reviews: typeof native.reviews = {
  get: (id: string) => {
    if (window.portalRouterTest.deferNextReview) {
      window.portalRouterTest.deferNextReview = false;
      window.portalRouterTest.pendingReviewId = id;
      return new Promise((resolve) => {
        resolvePending = resolve;
      });
    }
    return Promise.resolve(portalReview(id));
  },
  save: unavailableReviews.save,
  export: unavailableReviews.export,
};
export const downloadLink: typeof native.downloadLink = () =>
  Promise.reject(new Error('Download sintético não implementado.'));
export const nativeError = (cause: unknown) =>
  cause instanceof Error ? cause : new Error(String(cause));

declare global {
  interface Window {
    portalRouterTest: {
      deferNextReview: boolean;
      deferNextMutation: boolean;
      pendingMutation: string | null;
      completedMutation: string | null;
      removeCalendar(id: string): void;
      pendingReviewId: string | null;
      resolvePendingReview(): void;
      resolvePendingMutation(): void;
    };
  }
}
