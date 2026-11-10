import { ConvexError } from 'convex/values';
import { civilDate } from '../../src/domain/civil-date.ts';
import './audit-data.ts';
import { mountApplication } from './mount-application.ts';
import { getFunctionName } from 'convex/server';
import type { FunctionReference } from 'convex/server';
import { portalReview } from './portal-router-client.ts';
import type { Bootstrap } from '../../web/shared/convex/types.ts';
import type { Id } from '../../convex/_generated/dataModel.js';
import type { CalendarStatus } from '../../src/domain/calendar/lifecycle.ts';
import { matchesSearch } from '../../src/shared/search-text.ts';
import '../../web/style.css';
import '../../web/portal.css';
import '../../web/portal/react-portal.css';

const campusId = 'campus-a' as Id<'campuses'>;
if (location.pathname === '/__portal')
  history.replaceState(null, '', '/calendarios' + location.search);
let collectionsReady = !new URLSearchParams(location.search).has('collections-loading');
const multipleReviews = new URLSearchParams(location.search).has('multiple-reviews');
// A long list whose only "Informática" calendar sits past several server pages.
const longList = new URLSearchParams(location.search).has('long-list');
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
        start: civilDate('2027-01-01'),
        end: civilDate('2027-01-01'),
        effect: 'exclude',
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
  campusName: 'Campus de teste',
  year: 2027,
  offerKinds: ['integrado'],
  status: (new URLSearchParams(location.search).get('calendar-status') ??
    'rascunho') as CalendarStatus,
  statusRevision: 0,
  courses: 'Curso de teste',
  classes: '',
  shifts: '',
  version: 1,
  updatedAt: '2026-10-23T12:00:00Z',
  createdByName: 'Pessoa autora',
  updatedByName: 'Pessoa editora',
};
// As the server, the queue lists one situation at a time; the rows default to the first tab.
const queueStatus = (new URLSearchParams(location.search).get('queue-status') ??
  'enviado') as CalendarStatus;
function reviewQueueRows(status = 'enviado', campus?: string) {
  if (status !== queueStatus || (campus && campus !== campusId)) return [];
  return calendarRows(false).map((item) => ({
    ...item,
    status: queueStatus,
    statusRevision: 1,
    assignee: null,
    submission: null,
    review: null,
  }));
}
function reviewQueueCounts(campus?: string) {
  const count = (status: string) => ({
    count: reviewQueueRows(status, campus).length,
    more: false,
  });
  return { enviado: count('enviado'), em_revisao: count('em_revisao') };
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
const longListRows = Array.from({ length: 260 }, (_, index) => ({
  ...calendar,
  id: `calendar-long-${index}` as Id<'calendars'>,
  name: `Calendário 2027 - Campus de teste — Lista ${index}`,
  status: (index % 2 ? 'vigente' : 'rascunho') as CalendarStatus,
  courses: index === 230 ? 'Técnico em Informática' : 'Curso de teste',
}));
/** As `calendarPage`: the situation fills the page, and the search filters each page once read. */
function calendarPage(args: {
  deleted?: boolean;
  status?: string;
  search?: string;
  paginationOpts?: { numItems: number; cursor: string | null };
}) {
  const rows = (longList && !args.deleted ? longListRows : calendarRows(!!args.deleted)).filter(
    (item) => !args.status || item.status === args.status,
  );
  const start = Number(args.paginationOpts?.cursor ?? 0);
  const end = start + (args.paginationOpts?.numItems ?? rows.length);
  return {
    page: rows
      .slice(start, end)
      .filter((item) =>
        matchesSearch(args.search ?? '', item.name, item.courses, item.classes, item.shifts),
      ),
    isDone: end >= rows.length,
    continueCursor: String(end),
  };
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
    args: {
      deleted?: boolean;
      year?: number;
      status?: string;
      id?: string;
      campusId?: string;
      search?: string;
      paginationOpts?: { numItems: number; cursor: string | null };
    },
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
        : name === 'reviews:reviewQueueCounts'
          ? reviewQueueCounts(args.campusId)
          : name === 'calendars:calendarPage'
            ? calendarPage(args)
            : {
                page:
                  name === 'reviews:reviewQueue' ? reviewQueueRows(args.status, args.campusId) : [],
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
            if ('page' in result && name === 'calendars:calendarPage') result = calendarPage(args);
            if ('page' in result && name === 'reviews:reviewQueue')
              result = { ...result, page: reviewQueueRows(args.status, args.campusId) };
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
        if (name === 'clientErrors:list') return window.auditTest.failures;
        if (name === 'feedback:listFeedback') return window.auditTest.feedback;
        if (!deferredDone) return undefined;
        if (name === 'reviews:review' && args.id && removedCalendars.has(args.id))
          throw new Error('Calendário removido.');
        // As the server for a calendar of another campus (`assertCampus`).
        if (name === 'calendars:calendar')
          throw new ConvexError({ status: 404, error: 'Registro não encontrado.' });
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
