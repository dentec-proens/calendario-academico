import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexProvider, type ConvexReactClient } from 'convex/react';
import { getFunctionName } from 'convex/server';
import type { FunctionReference } from 'convex/server';
import { Workspace } from '../../web/portal/App.tsx';
import type { Bootstrap, DocumentsData } from '../../web/native/types.ts';
import type { Id } from '../../convex/_generated/dataModel.js';
import '../../web/style.css';
import '../../web/portal.css';
import '../../web/portal/react-portal.css';

const campusId = 'campus-a' as Id<'campuses'>;
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
  users: [user],
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
    args: { deleted?: boolean; year?: number; status?: string },
  ) => {
    const name = getFunctionName(reference);
    const result = {
      page:
        name === 'native:documentPage'
          ? documents.filter(
              (document) =>
                (user.role === 'ADMIN' || document.publishedAt) &&
                (!args.year || document.year === args.year) &&
                (!args.status || document.status === args.status),
            )
          : name === 'native:calendarPage' && !args.deleted
            ? [calendar]
            : [],
      isDone: true,
      continueCursor: '',
    };
    return { onUpdate: () => () => {}, localQueryResult: () => result, journal: () => undefined };
  },
};
createRoot(document.getElementById('root')!).render(
  createElement(
    ConvexProvider,
    { client: client as unknown as ConvexReactClient },
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
);
