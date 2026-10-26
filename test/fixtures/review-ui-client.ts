import type { reviews as reviewOperations } from '../../web/shared/convex/reviews.ts';
import type { Bootstrap, Status } from '../../web/shared/convex/types.ts';
import type { Id } from '../../convex/_generated/dataModel.js';
import { api } from '../../convex/_generated/api.js';
import { getFunctionName, type FunctionReference } from 'convex/server';
import { reviewSupport, initialConclusion } from '../../src/review.ts';

type Support = Awaited<ReturnType<typeof reviewOperations.get>>;
const support = reviewSupport(
  {
    id: 'synthetic-review',
    name: '2027 — Campus de teste',
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
const initial = {
  ...support,
  catalogueRevision: 1,
  initialConclusion: initialConclusion(support),
  review: null,
  stale: false,
} as Support;
let snapshot = structuredClone(initial);
const calls = {
  saves: 0,
  failSave: false,
  deferNextSave: false,
  pendingSave: false,
  lastSave: null as Parameters<typeof reviewOperations.save>[1] | null,
};
let finishPendingSave: (() => void) | undefined;
const listeners = new Set<{ refresh: () => void; notify: () => void }>();
const user: Bootstrap['user'] = {
  id: 'synthetic-reviewer' as Id<'users'>,
  name: 'Parecerista de teste',
  email: 'parecer@example.invalid',
  role: 'PARECERISTA',
  active: true,
  campusId: null,
  inviteExpiresAt: null,
  loginMethod: 'local',
};
export const info: Bootstrap = {
  user,
  campuses: [
    { id: 'synthetic-campus' as Id<'campuses'>, name: 'Campus de teste', archived: false },
  ],
  users: [user],
  calendars: [],
  catalogue: { revision: 1, events: [] },
};
export const status: Status = { user, hosted: true, setupRequired: false, googleEnabled: false };
const calendars: Bootstrap['calendars'] = [
  {
    id: 'synthetic-review' as Id<'calendars'>,
    name: '2027 — Campus de teste',
    campusId: 'synthetic-campus' as Id<'campuses'>,
    year: 2027,
    offer: 'integrado',
    modalities: ['integrado'],
    purpose: 'test',
    courses: 'Curso de teste',
    classes: '',
    shifts: '',
    version: 1,
    updatedAt: '2026-10-23T15:00:00Z',
  },
];

function query(reference: FunctionReference<'query'>) {
  switch (getFunctionName(reference)) {
    case 'reviews:review':
      return structuredClone(snapshot);
    case 'calendars:calendarPage':
      return { page: calendars, isDone: true, continueCursor: '' };
    default:
      throw new Error(`Consulta sintética não implementada: ${getFunctionName(reference)}`);
  }
}
export const functions = api;
export const convex = {
  url: 'http://127.0.0.1',
  connectionState: () => ({
    isWebSocketConnected: true,
    hasEverConnected: true,
    timeOfOldestInflightRequest: null,
    hasInflightRequests: false,
    inflightMutations: 0,
    inflightActions: 0,
  }),
  subscribeToConnectionState: () => () => {},
  query: (reference: FunctionReference<'query'>) => Promise.resolve(query(reference)),
  mutation: async (
    reference: FunctionReference<'mutation'>,
    args: { body: Parameters<typeof reviewOperations.save>[1] },
  ) => {
    if (getFunctionName(reference) !== 'reviews:saveReview')
      return Promise.reject(new Error('Mutação sintética não implementada.'));
    calls.saves++;
    if (calls.deferNextSave) {
      calls.deferNextSave = false;
      calls.pendingSave = true;
      await new Promise<void>((resolve) => {
        finishPendingSave = resolve;
      });
      calls.pendingSave = false;
    }
    if (calls.failSave) return Promise.reject(new Error('Falha sintética ao salvar.'));
    const body = args.body;
    calls.lastSave = structuredClone(body);
    if (
      body.calendarVersion !== snapshot.calendar.version ||
      body.catalogueRevision !== snapshot.catalogueRevision
    )
      throw new Error('O calendário ou a base mudou. Reabra a revisão.');
    if (body.revision !== (snapshot.review?.revision ?? 0))
      throw new Error('Outro revisor atualizou esta análise. Reabra antes de salvar.');
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
      reviewer: { id: user.id, name: user.name },
      updatedAt: '2026-10-23T15:00:00Z',
    };
    listeners.forEach((listener) => listener.refresh());
    listeners.forEach((listener) => listener.notify());
    return Promise.resolve({ revision: snapshot.review.revision });
  },
  watchQuery: (reference: FunctionReference<'query'>) => {
    let result = query(reference);
    return {
      onUpdate: (notify: () => void) => {
        const listener = {
          notify,
          refresh: () => {
            result = query(reference);
          },
        };
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      localQueryResult: () => result,
      journal: () => undefined,
    };
  },
};
window.reviewUiTest = {
  calls,
  publishReview(processNumber: string) {
    if (!snapshot.review) throw new Error('Salve uma revisão antes da atualização remota.');
    snapshot.review = {
      ...snapshot.review,
      processNumber,
      revision: snapshot.review.revision + 1,
    };
    listeners.forEach((listener) => listener.refresh());
    listeners.forEach((listener) => listener.notify());
  },
  resolvePendingSave() {
    if (!finishPendingSave) throw new Error('Nenhuma gravação pendente.');
    finishPendingSave();
    finishPendingSave = undefined;
  },
};
declare global {
  interface Window {
    reviewUiTest: {
      calls: typeof calls;
      publishReview: (processNumber: string) => void;
      resolvePendingSave: () => void;
    };
  }
}
