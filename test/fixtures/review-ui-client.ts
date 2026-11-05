import type { reviews as reviewOperations } from '../../web/shared/convex/reviews.ts';
import type { Bootstrap, Status } from '../../web/shared/convex/types.ts';
import type { Id } from '../../convex/_generated/dataModel.js';
import { api } from '../../convex/_generated/api.js';
import { getFunctionName, type FunctionReference } from 'convex/server';
import { reviewSupport } from '../../src/domain/reviews/technical-support.ts';
import { initialConclusion } from '../../src/domain/reviews/conclusion.ts';
import { civilDate } from '../../src/domain/civil-date.ts';

type Support = Awaited<ReturnType<typeof reviewOperations.get>>;
/** The synthetic calendar under review; `publishInternalDates` adds dates to its criteria. */
const reviewRecord = () => ({
  id: 'synthetic-review',
  name: '2027 — Campus de teste',
  version: 1,
  state: {
    year: 2027,
    campus: 'Campus de teste',
    schemaVersion: 6 as const,
    offers: [
      {
        id: 'integrado',
        kind: 'integrado' as const,
        delivery: 'a-conferir' as const,
        organization: 'anual' as const,
      },
    ],
    weekdays: [],
    weekConfirmed: false,
    periods: [],
    events: [],
  },
});
const support = reviewSupport(reviewRecord(), []);
const initial = {
  ...support,
  calendar: {
    ...support.calendar,
    id: support.calendar.id as Id<'calendars'>,
    campus: support.calendar.campus ?? '',
  },
  catalogueRevision: 1,
  initialConclusion: initialConclusion(support),
  review: null,
  stale: false,
  status: 'enviado',
  statusRevision: 1,
  submission: {
    id: 'synthetic-submission' as Id<'calendarSubmissions'>,
    sequence: 1,
    submittedAt: '2026-10-23T15:00:00Z',
    submittedBy: 'Campus de teste',
    submittedFrom: 'rascunho',
    outcome: 'submitted',
  },
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
    campusName: 'Campus de teste',
    year: 2027,
    offerKinds: ['integrado'],
    status: 'enviado',
    statusRevision: 1,
    courses: 'Curso de teste',
    classes: '',
    shifts: '',
    version: 1,
    updatedAt: '2026-10-23T15:00:00Z',
  },
];

function query(reference: FunctionReference<'query'>, args: { status?: string } = {}) {
  switch (getFunctionName(reference)) {
    case 'reviews:review':
      return structuredClone(snapshot);
    case 'calendars:calendarPage':
      return { page: calendars, isDone: true, continueCursor: '' };
    case 'reviews:reviewQueue':
      return {
        // As the server, saving the first parecer starts the review and moves the calendar there.
        page: calendars
          .map((calendar) => ({
            ...calendar,
            status: snapshot.review ? ('em_revisao' as const) : ('enviado' as const),
            submission: {
              id: 'synthetic-submission' as Id<'calendarSubmissions'>,
              sequence: 1,
              submittedAt: '2026-10-23T15:00:00Z',
              resubmission: false,
            },
            review: snapshot.review
              ? {
                  revision: snapshot.review.revision,
                  reviewerName: snapshot.review.reviewer.name,
                  updatedAt: snapshot.review.updatedAt,
                  reviewed: snapshot.review.entries.filter(
                    (entry) => entry.reviewed && entry.status !== 'PENDENTE',
                  ).length,
                  total: snapshot.criteria.length,
                  calendarChanged: snapshot.review.calendarVersion !== calendar.version,
                  otherSubmission: false,
                }
              : null,
          }))
          .filter((calendar) => calendar.status === (args.status ?? 'enviado')),
        isDone: true,
        continueCursor: '',
      };
    case 'calendars:calendarSubmissions':
      return { page: [], isDone: true, continueCursor: '', defaultBases: [], related: [] };
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
      throw new Error('Outro revisor atualizou este parecer. Reabra antes de salvar.');
    snapshot.review = {
      calendarId: snapshot.calendar.id,
      calendarVersion: body.calendarVersion,
      catalogueRevision: body.catalogueRevision,
      rulesetVersion: body.rulesetVersion,
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
  watchQuery: (reference: FunctionReference<'query'>, args: { status?: string } = {}) => {
    let result = query(reference, args);
    return {
      onUpdate: (notify: () => void) => {
        const listener = {
          notify,
          refresh: () => {
            result = query(reference, args);
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
  publishLegacy2027Review() {
    snapshot.rulesetVersion = 'consup-292-2027-v1';
    snapshot.review = {
      calendarId: snapshot.calendar.id,
      calendarVersion: snapshot.calendar.version,
      catalogueRevision: snapshot.catalogueRevision,
      revision: 1,
      entries: snapshot.criteria.map((criterion) => ({
        id: criterion.id,
        status: 'ATENDIDO',
        reviewed: true,
        notes:
          criterion.id === 'XXV'
            ? 'Semana cultural conforme a regra anterior.'
            : 'Conferência anterior.',
      })),
      conclusion: 'Conclusão anterior: todos os critérios atendidos.',
      processNumber: '',
      applicableNorm: 'Norma anterior',
      source: 'SEI 3959640',
      documentSnapshot: [],
      officialApproval: false,
      reviewer: { id: user.id, name: user.name },
      updatedAt: '2026-10-23T15:00:00Z',
    };
    snapshot.stale = true;
    listeners.forEach((listener) => listener.refresh());
    listeners.forEach((listener) => listener.notify());
  },
  /** Criteria of a calendar with an official and an internal date (art. 18) of the campus. */
  publishInternalDates() {
    const date = (id: string, name: string) => ({
      id,
      name,
      start: civilDate('2027-10-05'),
      end: civilDate('2027-10-05'),
      effect: 'note' as const,
      category: 'evento',
      offers: ['integrado'],
      evidence: '',
    });
    snapshot.criteria = reviewSupport(reviewRecord(), [
      date('cultural-week', 'Semana Cultural Interescolar'),
      { ...date('cultural-rehearsal', 'Ensaio da Semana Cultural'), internal: true },
    ]).criteria as Support['criteria'];
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
      publishLegacy2027Review: () => void;
      publishInternalDates: () => void;
      resolvePendingSave: () => void;
    };
  }
}
