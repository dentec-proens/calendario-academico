import { controlledLazy as lazy } from './controlled-lazy.tsx';
import { createRootRouteWithContext, createRoute, redirect } from '@tanstack/react-router';
import { parseEditorPath, type PortalPageId } from '#src/app/routes.ts';
import type { PortalPermissions } from '../portal/permissions.ts';
import { portalPermissions } from '../portal/permissions.ts';
import type { SessionState } from './session.tsx';
import { applicationSearch } from './search.ts';
import RootLayout from './layouts/RootLayout.tsx';
import WorkspaceLayout from './layouts/WorkspaceLayout.tsx';
import AuthenticatedLayout from './layouts/AuthenticatedLayout.tsx';
import { ApplicationError, NotFoundPage } from './errors.tsx';
import { loginReturnTarget } from '#src/app/login-return.ts';
import { editorPages } from '../features/calendar-editor/editor-steps.ts';
import { calendarReferenceAnchor, isCalendarReferenceHash } from '#src/app/calendar-reference.ts';

export interface ApplicationContext {
  session: SessionState;
}

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    title?: string;
    page?: PortalPageId;
    /** Parent page linked above the heading of a detail page. */
    back?: PortalPageId;
    creating?: boolean;
  }
}

function permission(permission: keyof PortalPermissions) {
  return ({
    context,
    location,
  }: {
    context: ApplicationContext;
    location: { pathname: string };
  }) => {
    const { info, isLoading } = context.session;
    if (!isLoading && info && !portalPermissions(info.user.role)[permission]) {
      const to =
        permission === 'manageInstitution'
          ? location.pathname.startsWith('/documentos')
            ? '/documentos'
            : '/eventos-institucionais'
          : portalPermissions(info.user.role).editCalendars
            ? '/calendarios'
            : '/revisoes';
      throw redirect({ to, search: { aviso: 'acesso-negado' } });
    }
  };
}

const root = createRootRouteWithContext<ApplicationContext>()({
  component: RootLayout,
  validateSearch: applicationSearch,
  errorComponent: ApplicationError,
  notFoundComponent: NotFoundPage,
});
const access = createRoute({
  getParentRoute: () => root,
  path: '/',
  component: lazy(() => import('../features/access/AccessPage.tsx')),
  beforeLoad: ({ context, location }) => {
    if (!context.session.isLoading && context.session.info) {
      const target = loginReturnTarget(
        location.searchStr,
        typeof window === 'undefined' ? 'https://local.invalid' : window.location.origin,
      );
      if (target) throw redirect({ href: target });
      throw redirect({
        to: portalPermissions(context.session.info.user.role).editCalendars
          ? '/calendarios'
          : '/revisoes',
      });
    }
  },
});
const activation = createRoute({
  getParentRoute: () => root,
  path: '/ativar-conta',
  component: lazy(() => import('../features/access/ActivatePage.tsx')),
});
const recovery = createRoute({
  getParentRoute: () => root,
  path: '/recuperar-senha',
  component: lazy(() => import('../features/access/RecoverPage.tsx')),
});
const authenticated = createRoute({
  getParentRoute: () => root,
  id: '_authenticated',
  component: AuthenticatedLayout,
  beforeLoad: ({ context, location }) => {
    if (
      context.session.editorRecovery &&
      context.session.editorRecovery.calendarId === parseEditorPath(location.pathname)?.id
    )
      return;
    if (!context.session.isLoading && !context.session.isAuthenticated) {
      const hash =
        parseEditorPath(location.pathname)?.section === 'events' &&
        isCalendarReferenceHash(location.hash)
          ? `#${calendarReferenceAnchor}`
          : '';
      throw redirect({
        to: '/',
        search: { retorno: location.pathname + location.searchStr + hash },
      });
    }
  },
});
const workspace = createRoute({
  getParentRoute: () => authenticated,
  id: '_workspace',
  component: WorkspaceLayout,
});
const calendars = createRoute({
  getParentRoute: () => workspace,
  path: '/calendarios',
  beforeLoad: permission('editCalendars'),
  component: lazy(() => import('../features/calendars/CalendarsPage.tsx')),
  staticData: { title: 'Calendários', page: 'calendars' },
});
const calendarTrash = createRoute({
  getParentRoute: () => workspace,
  path: '/calendarios/lixeira',
  beforeLoad: permission('editCalendars'),
  component: lazy(() => import('../features/calendars/CalendarTrashPage.tsx')),
  staticData: { title: 'Lixeira de calendários', page: 'calendars' },
});
const newCalendar = createRoute({
  getParentRoute: () => workspace,
  path: '/calendarios/novo',
  beforeLoad: permission('editCalendars'),
  component: lazy(() => import('../features/calendars/CalendarsPage.tsx')),
  staticData: { title: 'Calendários', page: 'calendars', creating: true },
});
const documents = createRoute({
  getParentRoute: () => workspace,
  path: '/documentos',
  component: lazy(() => import('../features/documents/DocumentsPage.tsx')),
  staticData: { title: 'Documentos e normas', page: 'institution' },
});
const newDocument = createRoute({
  getParentRoute: () => workspace,
  path: '/documentos/novo',
  beforeLoad: permission('manageInstitution'),
  component: lazy(() => import('../features/documents/DocumentsPage.tsx')),
  staticData: { title: 'Documentos e normas', page: 'institution', creating: true },
});
const catalogue = createRoute({
  getParentRoute: () => workspace,
  path: '/eventos-institucionais',
  component: lazy(() => import('../features/catalogue/CataloguePage.tsx')),
  staticData: { title: 'Feriados e eventos institucionais', page: 'institution-events' },
});
const newCatalogue = createRoute({
  getParentRoute: () => workspace,
  path: '/eventos-institucionais/novo',
  beforeLoad: permission('manageInstitution'),
  component: lazy(() => import('../features/catalogue/CataloguePage.tsx')),
  staticData: {
    title: 'Feriados e eventos institucionais',
    page: 'institution-events',
    creating: true,
  },
});
const editCatalogue = createRoute({
  getParentRoute: () => workspace,
  path: '/eventos-institucionais/$eventId/editar',
  beforeLoad: permission('manageInstitution'),
  component: lazy(() => import('../features/catalogue/CataloguePage.tsx')),
  staticData: {
    title: 'Feriados e eventos institucionais',
    page: 'institution-events',
    creating: true,
  },
});
const rules = createRoute({
  getParentRoute: () => workspace,
  path: '/regras',
  component: lazy(() => import('../features/rules/RulesPage.tsx')),
  staticData: { title: 'Regras do calendário', page: 'rules' },
});
const reviews = createRoute({
  getParentRoute: () => workspace,
  path: '/revisoes',
  beforeLoad: permission('reviewCalendars'),
  component: lazy(() => import('../features/reviews/ReviewsPage.tsx')),
  staticData: { title: 'Revisões e pareceres', page: 'review-panel' },
});
const review = createRoute({
  getParentRoute: () => workspace,
  path: '/revisoes/$calendarId',
  beforeLoad: permission('reviewCalendars'),
  component: lazy(() => import('../features/reviews/ReviewPage.tsx')),
  staticData: { title: 'Parecer do calendário', page: 'review-panel', back: 'review-panel' },
});
const campuses = createRoute({
  getParentRoute: () => workspace,
  path: '/campi',
  beforeLoad: permission('manageCampuses'),
  component: lazy(() => import('../features/campuses/CampusesPage.tsx')),
  staticData: { title: 'Campi', page: 'campuses' },
});
const newCampus = createRoute({
  getParentRoute: () => workspace,
  path: '/campi/novo',
  beforeLoad: permission('manageCampuses'),
  component: lazy(() => import('../features/campuses/CampusesPage.tsx')),
  staticData: { title: 'Campi', page: 'campuses', creating: true },
});
const accounts = createRoute({
  getParentRoute: () => workspace,
  path: '/contas',
  beforeLoad: permission('manageAccounts'),
  component: lazy(() => import('../features/accounts/AccountsPage.tsx')),
  staticData: { title: 'Contas e acessos', page: 'accounts' },
});
const newAccount = createRoute({
  getParentRoute: () => workspace,
  path: '/contas/nova',
  beforeLoad: permission('manageAccounts'),
  component: lazy(() => import('../features/accounts/AccountsPage.tsx')),
  staticData: { title: 'Contas e acessos', page: 'accounts', creating: true },
});
const online = createRoute({
  getParentRoute: () => workspace,
  path: '/usuarios-online',
  beforeLoad: permission('viewOnlineUsers'),
  component: lazy(() => import('../features/presence/OnlineUsersPage.tsx')),
  staticData: { title: 'Usuários online', page: 'online-users' },
});
const audit = createRoute({
  getParentRoute: () => workspace,
  path: '/logs',
  component: lazy(() => import('../features/audit/AuditPage.tsx')),
  staticData: { title: 'Registro de operações', page: 'logs' },
});
const EditorLayout = lazy(() => import('../features/calendar-editor/CalendarEditorLayout.tsx'));
function CalendarEditor() {
  const { calendarId } = editor.useParams();
  return <EditorLayout key={calendarId} calendarId={calendarId} />;
}
const editor = createRoute({
  getParentRoute: () => authenticated,
  path: '/calendarios/$calendarId',
  component: CalendarEditor,
});
const identity = createRoute({
  getParentRoute: () => editor,
  path: '/editar',
  component: lazy(() => import('../features/calendar-editor/sections/WeekSection.tsx')),
  staticData: { title: editorPages.edit.title },
});
const periods = createRoute({
  getParentRoute: () => editor,
  path: '/periodos',
  component: lazy(() => import('../features/calendar-editor/sections/PeriodsSection.tsx')),
  staticData: { title: editorPages.periods.title },
});
const days = createRoute({
  getParentRoute: () => editor,
  path: '/dias',
  component: lazy(() => import('../features/calendar-editor/sections/DaysSection.tsx')),
  staticData: { title: editorPages.days.title },
});
const assessments = createRoute({
  getParentRoute: () => editor,
  path: '/avaliacoes',
  beforeLoad: ({ params }) => {
    throw redirect({
      to: editorPages.periods.path,
      params,
      hash: 'assessment-area',
      replace: true,
      search: (previous) => previous,
    });
  },
  staticData: { title: editorPages.assessments.title },
});
const vacations = createRoute({
  getParentRoute: () => editor,
  path: '/ferias',
  component: lazy(() => import('../features/calendar-editor/sections/VacationsSection.tsx')),
  staticData: { title: editorPages.vacations.title },
});
const events = createRoute({
  getParentRoute: () => editor,
  path: '/eventos',
  component: lazy(() => import('../features/calendar-editor/sections/EventsSection.tsx')),
  staticData: { title: editorPages.events.title },
});
const history = createRoute({
  getParentRoute: () => editor,
  path: '/historico',
  beforeLoad: ({ params }) => {
    throw redirect({
      to: editorPages.events.path,
      params,
      hash: '',
      replace: true,
      search: (previous) => ({
        ...previous,
        aba: previous.aba === 'eventos' ? 'eventos' : undefined,
      }),
      hashScrollIntoView: false,
    });
  },
  staticData: { title: editorPages.events.title },
});
const issues = createRoute({
  getParentRoute: () => editor,
  path: '/pendencias',
  component: lazy(() => import('../features/calendar-editor/sections/IssuesSection.tsx')),
  staticData: { title: editorPages.issues.title },
});
const preview = createRoute({
  getParentRoute: () => editor,
  path: '/visualizar',
  component: lazy(() => import('../features/calendar-editor/sections/CalendarPreviewSection.tsx')),
  staticData: { title: editorPages.calendar.title },
});

export const routeTree = root.addChildren([
  access,
  activation,
  recovery,
  authenticated.addChildren([
    workspace.addChildren([
      calendars,
      calendarTrash,
      newCalendar,
      documents,
      newDocument,
      catalogue,
      newCatalogue,
      editCatalogue,
      rules,
      reviews,
      review,
      campuses,
      newCampus,
      accounts,
      newAccount,
      online,
      audit,
    ]),
    editor.addChildren([
      identity,
      periods,
      assessments,
      days,
      vacations,
      events,
      history,
      issues,
      preview,
    ]),
  ]),
]);
