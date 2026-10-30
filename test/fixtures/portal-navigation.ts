import './audit-data.ts';
import { mountApplication } from './mount-application.ts';
import { getFunctionName } from 'convex/server';
import type { FunctionReference } from 'convex/server';
import { portalReview } from './portal-router-client.ts';
import type { Bootstrap, DocumentsData } from '../../web/shared/convex/types.ts';
import type { Id } from '../../convex/_generated/dataModel.js';
import '../../web/style.css';
import '../../web/portal.css';
import '../../web/portal/react-portal.css';

const campusId = 'campus-a' as Id<'campuses'>;
if (location.pathname === '/__portal')
  history.replaceState(null, '', '/calendarios' + location.search);
let collectionsReady = !new URLSearchParams(location.search).has('collections-loading');
const multipleReviews = new URLSearchParams(location.search).has('multiple-reviews');
const removedCalendars = new Set<string>();
const queryListeners = new Set<{ refresh: () => void; notify: () => void }>();
window.portalRouterTest.resolvePendingCollections = () => {
  collectionsReady = true;
  for (const listener of queryListeners) listener.notify();
};
window.portalRouterTest.removeCalendar = (id) => {
  removedCalendars.add(id);
  // Convex publishes a consistent snapshot for all queries before notifying hooks.
  const listeners = [...queryListeners];
  for (const listener of listeners) listener.refresh();
  for (const listener of listeners) listener.notify();
};
window.auditTest.publish = (page) => {
  window.auditTest.first = page;
  const listeners = [...queryListeners];
  for (const listener of listeners) listener.refresh();
  for (const listener of listeners) listener.notify();
};
const requestedRole = new URLSearchParams(location.search).get('role');
const campusRole = requestedRole === 'CAMPUS';
const user: Bootstrap['user'] = {
  id: 'user-a' as Id<'users'>,
  name: 'Pessoa de teste',
  email: 'teste@example.invalid',
  role: campusRole ? 'CAMPUS' : requestedRole === 'PARECERISTA' ? 'PARECERISTA' : 'ADMIN',
  campusId: campusRole ? campusId : null,
  active: true,
  inviteExpiresAt: null,
  loginMethod: 'local',
};
const info: Bootstrap = {
  user,
  campuses: [{ id: campusId, name: 'Campus de teste', archived: false }],
  calendars: [],
  users: [
    user,
    {
      ...user,
      id: 'user-invited' as Id<'users'>,
      name: 'Pessoa com convite pendente',
      email: 'convite@example.invalid',
      active: false,
      loginMethod: 'invite',
    },
    {
      ...user,
      id: 'user-campus' as Id<'users'>,
      name: 'Responsável por campus com nome bastante extenso para conferir a disposição',
      email: 'responsavel.com.email.institucional.extenso@example.invalid',
      role: 'CAMPUS',
      campusId,
    },
    {
      ...user,
      id: 'user-reviewer' as Id<'users'>,
      name: 'Pessoa parecerista',
      email: 'parecer@example.invalid',
      role: 'PARECERISTA',
      loginMethod: 'google',
    },
  ],
  catalogue: {
    revision: 1,
    events: [
      {
        id: 'synthetic-event',
        name: 'Evento institucional de teste',
        start: '2027-01-01',
        end: '2027-01-01',
        kind: 'exclude',
        category: 'feriado',
        evidence: 'Fonte de teste',
        modalities: ['integrado'],
        active: true,
      },
    ],
  },
};
const calendar: Bootstrap['calendars'][number] = {
  id: 'calendar-a' as Id<'calendars'>,
  name: 'Calendário de teste',
  campusId,
  year: 2027,
  offerKinds: ['integrado'],
  purpose: 'test',
  courses: 'Curso de teste',
  classes: '',
  shifts: '',
  version: 1,
  updatedAt: '2026-10-23T12:00:00Z',
  createdByName: 'Pessoa autora',
  updatedByName: 'Pessoa editora',
};
const documents: DocumentsData['documents'] = (['rascunho', 'vigente', 'arquivado'] as const).map(
  (status, i) => ({
    id: `document-${i}` as Id<'documents'>,
    year: i === 2 ? 2028 : 2027,
    type: 'norma',
    title: `Documento ${status}`,
    source: 'Fonte de teste',
    filename: 'teste.pdf',
    hash: 'a'.repeat(64),
    status,
    version: 1,
    createdAt: '2026-10-23T12:00:00Z',
    ...(i === 0 && new URLSearchParams(location.search).has('missing-document')
      ? {
          unavailableFile: {
            reason: 'not_migrated' as const,
            sourceReference: 'synthetic-original',
          },
        }
      : {}),
    ...(status !== 'rascunho' ? { publishedAt: '2026-10-23T12:00:00Z' } : {}),
  }),
);
function reviewQueueRows() {
  return calendarRows(false).map((item) => ({ ...item, review: null }));
}
function calendarRows(deleted: boolean) {
  return [
    calendar,
    ...(multipleReviews
      ? [{ ...calendar, id: 'calendar-b' as Id<'calendars'>, name: 'Calendário calendar-b' }]
      : []),
  ]
    .filter((item) => removedCalendars.has(item.id) === deleted)
    .map((item) => (deleted ? { ...item, deletedAt: 1793361600000 } : item));
}
window.portalRouterTest.restoreCalendar = (id) => {
  removedCalendars.delete(id);
  const listeners = [...queryListeners];
  for (const listener of listeners) listener.refresh();
  for (const listener of listeners) listener.notify();
};
const connection = {
  isWebSocketConnected: true,
  hasEverConnected: true,
  timeOfOldestInflightRequest: null,
  hasInflightRequests: false,
  inflightMutations: 0,
  inflightActions: 0,
};
const client = {
  connectionState: () => connection,
  subscribeToConnectionState: () => () => {},
  watchQuery: (
    reference: FunctionReference<'query'>,
    args: { deleted?: boolean; year?: number; status?: string; id?: string },
  ) => {
    const name = getFunctionName(reference);
    let result =
      name === 'reviews:review'
        ? (() => {
            try {
              return portalReview(args.id ?? '');
            } catch (error) {
              return error instanceof Error ? error : new Error(String(error));
            }
          })()
        : {
            page:
              name === 'documents:documentPage'
                ? documents.filter(
                    (document) =>
                      (user.role === 'ADMIN' || document.publishedAt) &&
                      (!args.year || document.year === args.year) &&
                      (!args.status || document.status === args.status),
                  )
                : name === 'calendars:calendarPage'
                  ? calendarRows(!!args.deleted)
                  : name === 'reviews:reviewQueue'
                    ? reviewQueueRows()
                    : [],
            isDone: true,
            continueCursor: '',
          };
    const deferred = name === 'reviews:review' && window.portalRouterTest.deferNextReview;
    if (deferred) {
      window.portalRouterTest.deferNextReview = false;
      window.portalRouterTest.pendingReviewId = args.id ?? null;
    }
    let deferredDone = !deferred;
    let refreshReview: (() => void) | undefined;
    if (deferred)
      window.portalRouterTest.resolvePendingReview = () => {
        deferredDone = true;
        window.portalRouterTest.pendingReviewId = null;
        refreshReview?.();
      };
    return {
      onUpdate: (onUpdate: () => void) => {
        const listener = {
          refresh: () => {
            if ('page' in result && name === 'calendars:calendarPage')
              result = {
                ...result,
                page: calendarRows(!!args.deleted),
              };
            if ('page' in result && name === 'reviews:reviewQueue')
              result = { ...result, page: reviewQueueRows() };
          },
          notify: onUpdate,
        };
        refreshReview = onUpdate;
        queryListeners.add(listener);
        return () => queryListeners.delete(listener);
      },
      localQueryResult: () => {
        if (
          !collectionsReady &&
          (name === 'documents:documentPage' ||
            name === 'calendars:calendarPage' ||
            name === 'reviews:reviewQueue')
        )
          return undefined;
        if (name === 'workspace:logs') return window.auditTest.first;
        if (!deferredDone) return undefined;
        if (name === 'reviews:review' && args.id && removedCalendars.has(args.id))
          throw new Error('Calendário removido.');
        if (result instanceof Error) throw result;
        return result;
      },
      journal: () => undefined,
    };
  },
};
const application = mountApplication({
  client,
  info,
  status: { user, hosted: true, setupRequired: false, googleEnabled: false },
});
window.portalRouterTest.catalogue = info.catalogue;
window.portalRouterTest.members = info.users;
window.portalRouterTest.publishCatalogue = (catalogue) => {
  info.catalogue = structuredClone(catalogue);
  window.portalRouterTest.catalogue = info.catalogue;
  application.updateInfo({ ...info });
};
window.portalRouterTest.publishMember = (member) => {
  if (member.id === info.user.id) info.user = member;
  info.users = info.users.map((current) => (current.id === member.id ? member : current));
  window.portalRouterTest.members = info.users;
  application.updateInfo({ ...info });
};
