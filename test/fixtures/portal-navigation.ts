import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexProvider, type ConvexReactClient } from 'convex/react';
import { getFunctionName } from 'convex/server';
import type { FunctionReference } from 'convex/server';
import { Workspace } from '../../web/portal/App.tsx';
import { ApplicationRouter } from '../../web/routing.tsx';
import { portalReview } from './portal-router-client.ts';
import ConfirmationDialogHost from '../../web/components/ConfirmationDialog.tsx';
import type { Bootstrap, DocumentsData } from '../../web/native/types.ts';
import type { Id } from '../../convex/_generated/dataModel.js';
import '../../web/style.css';
import '../../web/portal.css';
import '../../web/portal/react-portal.css';

const campusId = 'campus-a' as Id<'campuses'>;
if (location.pathname === '/__portal')
  history.replaceState(null, '', '/calendarios' + location.search);
const multipleReviews = new URLSearchParams(location.search).has('multiple-reviews');
const removedCalendars = new Set<string>();
const queryListeners = new Set<{ refresh: () => void; notify: () => void }>();
window.portalRouterTest.removeCalendar = (id) => {
  removedCalendars.add(id);
  // Convex publishes a consistent snapshot for all queries before notifying hooks.
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
  modalities: ['integrado'],
  offer: 'integrado',
  purpose: 'test',
  courses: 'Curso de teste',
  classes: '',
  shifts: '',
  version: 1,
  updatedAt: '2026-10-23T12:00:00Z',
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
    ...(status !== 'rascunho' ? { publishedAt: '2026-10-23T12:00:00Z' } : {}),
  }),
);
const client = {
  watchQuery: (
    reference: FunctionReference<'query'>,
    args: { deleted?: boolean; year?: number; status?: string; id?: string },
  ) => {
    const name = getFunctionName(reference);
    let result =
      name === 'native:review'
        ? portalReview(args.id ?? '')
        : {
            page:
              name === 'native:documentPage'
                ? documents.filter(
                    (document) =>
                      (user.role === 'ADMIN' || document.publishedAt) &&
                      (!args.year || document.year === args.year) &&
                      (!args.status || document.status === args.status),
                  )
                : name === 'native:calendarPage' && !args.deleted
                  ? [
                      calendar,
                      ...(multipleReviews
                        ? [
                            {
                              ...calendar,
                              id: 'calendar-b' as Id<'calendars'>,
                              name: 'Calendário calendar-b',
                            },
                          ]
                        : []),
                    ].filter((item) => !removedCalendars.has(item.id))
                  : [],
            isDone: true,
            continueCursor: '',
          };
    return {
      onUpdate: (onUpdate: () => void) => {
        const listener = {
          refresh: () => {
            if ('page' in result && name === 'native:calendarPage')
              result = {
                ...result,
                page: (result.page as Bootstrap['calendars']).filter(
                  (item) => !removedCalendars.has(item.id),
                ),
              };
          },
          notify: onUpdate,
        };
        queryListeners.add(listener);
        return () => queryListeners.delete(listener);
      },
      localQueryResult: () => {
        if (name === 'native:review' && args.id && removedCalendars.has(args.id))
          throw new Error('Calendário removido.');
        return result;
      },
      journal: () => undefined,
    };
  },
};
createRoot(document.getElementById('root')!).render(
  createElement(
    ConvexProvider,
    { client: client as unknown as ConvexReactClient },
    createElement(
      ApplicationRouter,
      { document: 'portal.html' },
      createElement(
        'main',
        null,
        createElement(Workspace, {
          info,
          status: { user, hosted: true, setupRequired: false, googleEnabled: false },
          notify: () => {},
        }),
      ),
    ),
    createElement(ConfirmationDialogHost),
  ),
);
