import { scrollIntoView } from '../scroll.ts';
import { Button } from '../components/ui/Button.tsx';
import { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { Bootstrap, Notify, Status } from '../native/types.ts';
import type { Id } from '../../convex/_generated/dataModel.js';
import { usePaginatedQuery } from 'convex/react';
import { functions } from '../native/client.ts';
import {
  Building2,
  CalendarDays,
  ClipboardCheck,
  Library,
  Users,
  Menu,
  CalendarRange,
} from 'lucide-react';
import CalendarsPanel from './CalendarsPanel.tsx';
import CataloguePanel from './CataloguePanel.tsx';
import OnlineUsersPanel from './OnlineUsersPanel.tsx';
import CampusesPanel from './CampusesPanel.tsx';
import AccountsPanel from './AccountsPanel.tsx';
import DocumentsPanel from './DocumentsPanel.tsx';
import ReviewPanel from './ReviewPanel.tsx';
import { portalPermissions, type PortalPermissions } from './permissions.ts';
import {
  portalPaths,
  portalPageForPath,
  portalFormForPath,
  type PortalPageId,
} from '../../src/app-routes.ts';
import { AppLink, getAppRouter, navigateApp, useAppLocation } from '../routing.tsx';
import { loginReturnTarget } from '../../src/login-return.ts';

type PageId = PortalPageId;
const sharedPages: Array<[PageId, string, LucideIcon]> = [
  ['calendars', 'Calendários', CalendarDays],
  ['institution', 'Documentos e normas', Library],
  ['institution-events', 'Feriados e eventos institucionais', CalendarRange],
];
type AdminPage = [PageId, string, LucideIcon, keyof PortalPermissions];
const adminPages: AdminPage[] = [
  ['review-panel', 'Revisões e pareceres', ClipboardCheck, 'reviewCalendars'],
  ['campuses', 'Campi', Building2, 'manageCampuses'],
  ['accounts', 'Contas e acessos', Users, 'manageAccounts'],
  ['online-users', 'Usuários online', Users, 'viewOnlineUsers'],
];

function allowedAdminPages(permissions: PortalPermissions) {
  return adminPages.filter(([, , , permission]) => permissions[permission]);
}

function allowedSharedPages(permissions: PortalPermissions) {
  return sharedPages.filter(([id]) => id !== 'calendars' || permissions.editCalendars);
}

interface WorkspaceProps {
  info: Bootstrap;
  status: Status;
  notify: Notify;
}

export function Workspace({ info: metadata, status, notify }: WorkspaceProps) {
  const permissions = portalPermissions(metadata.user.role);
  const administrativePages = allowedAdminPages(permissions);
  const location = useAppLocation();
  const requested = portalPageForPath(location.pathname);
  const allowed = [...allowedSharedPages(permissions), ...administrativePages];
  const page =
    allowed.find(([id]) => id === requested)?.[0] ??
    (permissions.editCalendars ? 'calendars' : 'review-panel');
  const [menu, setMenu] = useState({ open: false, pathname: location.pathname });
  if (menu.pathname !== location.pathname) setMenu({ open: false, pathname: location.pathname });
  const menuOpen = menu.open && menu.pathname === location.pathname;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousPath = useRef(location.pathname);
  const parameters = new URLSearchParams(location.searchStr);
  const filter =
    permissions.selectCampus &&
    metadata.campuses.some((campus) => campus.id === parameters.get('campus'))
      ? parameters.get('campus')!
      : '';
  const documentYear = parameters.get('ano') ?? '';
  const requestedStatus = parameters.get('situacao');
  const documentStatus =
    permissions.manageInstitution &&
    (requestedStatus === 'rascunho' ||
      requestedStatus === 'vigente' ||
      requestedStatus === 'arquivado')
      ? requestedStatus
      : '';
  function changeFilter(key: string, value: string) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    void navigateApp(url.pathname + url.search, { replace: true });
  }
  const calendarPagination = usePaginatedQuery(
    functions.native.calendarPage,
    {
      deleted: false,
      ...(permissions.selectCampus && page === 'calendars' && filter
        ? { campusId: filter as Id<'campuses'> }
        : {}),
    },
    { initialNumItems: 50 },
  );
  const trashPagination = usePaginatedQuery(
    functions.native.calendarPage,
    { deleted: true },
    { initialNumItems: 50 },
  );
  const documentPagination = usePaginatedQuery(
    functions.native.documentPage,
    {
      ...(Number(documentYear) >= 1900 && Number(documentYear) <= 9999
        ? { year: Number(documentYear) }
        : {}),
      ...(permissions.manageInstitution && documentStatus ? { status: documentStatus } : {}),
    },
    { initialNumItems: 50 },
  );
  const info = { ...metadata, calendars: calendarPagination.results };
  const documentsData =
    documentPagination.status === 'LoadingFirstPage'
      ? undefined
      : { revision: info.catalogue.revision, documents: documentPagination.results };
  const trashData =
    trashPagination.status === 'LoadingFirstPage'
      ? undefined
      : { calendars: trashPagination.results };
  const administration = adminPages.some(([id]) => id === page);
  const title = [...sharedPages, ...adminPages].find(([id]) => id === page)?.[1];

  useEffect(() => {
    if (location.pathname === '/') {
      const target = loginReturnTarget(location.searchStr, window.location.origin);
      if (target) {
        void navigateApp(target, { replace: true });
        return;
      }
    }
    const formAllowed =
      page === 'calendars'
        ? permissions.editCalendars
        : page === 'campuses'
          ? permissions.manageCampuses
          : page === 'accounts'
            ? permissions.manageAccounts
            : permissions.manageInstitution;
    if (requested !== page || (portalFormForPath(location.pathname) && !formAllowed)) {
      const url = new URL(window.location.href);
      url.pathname = portalPaths[page];
      void navigateApp(url.pathname + url.search, { replace: true });
    }
  }, [
    requested,
    page,
    location.pathname,
    location.searchStr,
    permissions.editCalendars,
    permissions.manageCampuses,
    permissions.manageAccounts,
    permissions.manageInstitution,
  ]);

  useEffect(() => {
    document.title = `${title} · PROENS`;
    if (previousPath.current === location.pathname) return;
    previousPath.current = location.pathname;
    const frame = requestAnimationFrame(() => {
      if (portalFormForPath(location.pathname)) return;
      headingRef.current?.focus({ preventScroll: true });
      scrollIntoView(headingRef.current, { block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.pathname, title]);

  function showCampus(id: string) {
    void navigateApp(portalPaths.calendars + '?campus=' + encodeURIComponent(id));
  }

  function navigationItems(items: Array<[PageId, string, LucideIcon] | AdminPage>) {
    return items.map(([id, label, Icon]) => (
      <AppLink
        key={id}
        href={portalPaths[id]}
        className={'ui-button ui-button--primary sidebar-link' + (page === id ? ' active' : '')}
        data-page={id}
        id={id === 'accounts' ? 'admin-tab' : id === 'review-panel' ? 'review-tab' : undefined}
        aria-current={page === id ? 'page' : undefined}
      >
        <Icon aria-hidden="true" size={18} /> {label}
      </AppLink>
    ));
  }

  return (
    <section
      id="workspace"
      className="portal-workspace"
      data-area={administration ? 'admin' : 'shared'}
    >
      <a className="skip-navigation" href="#panel-title">
        Ir para o conteúdo
      </a>
      <Button
        type="button"
        variant="secondary"
        className="sidebar-toggle"
        aria-expanded={menuOpen}
        aria-controls="portal-navigation"
        onClick={() => setMenu({ open: !menuOpen, pathname: location.pathname })}
      >
        <Menu size={18} aria-hidden="true" /> Navegação · {title}
      </Button>
      <aside className="portal-sidebar" data-open={menuOpen}>
        <nav id="portal-navigation" aria-label="Seções do portal">
          <div className="navigation-group shared-navigation">
            <h2>Calendários e referências</h2>
            {!permissions.selectCampus ? <p>{info.campuses[0]?.name}</p> : null}
            {navigationItems(allowedSharedPages(permissions))}
          </div>
          {administrativePages.length ? (
            <div className="navigation-group admin-navigation">
              <h2>Administração</h2>
              {navigationItems(administrativePages)}
            </div>
          ) : null}
        </nav>
      </aside>
      <div className="portal-content">
        <div className="workspace-heading">
          <span className="area-badge">
            {administration ? 'Administração PROENS' : 'Calendários e referências'}
          </span>
          <h1 id="panel-title" ref={headingRef} tabIndex={-1}>
            {title}
          </h1>
          {!status.hosted ? (
            <p id="deployment-note" className="help">
              Desenvolvimento
            </p>
          ) : null}
        </div>
        <div hidden={page !== 'calendars' || !permissions.editCalendars}>
          {permissions.editCalendars ? (
            <CalendarsPanel
              info={info}
              canSelectCampus={permissions.selectCampus}
              filter={filter}
              onFilter={(id) => changeFilter('campus', id)}
              notify={notify}
              liveTrash={trashData}
              pagination={calendarPagination}
              trashPagination={trashPagination}
            />
          ) : null}
        </div>
        <section id="institution" className="page" hidden={page !== 'institution'}>
          <DocumentsPanel
            canManage={permissions.manageInstitution}
            liveData={documentsData}
            pagination={documentPagination}
            yearFilter={documentYear}
            onYearFilter={(year) => changeFilter('ano', year)}
            statusFilter={permissions.manageInstitution ? documentStatus : ''}
            onStatusFilter={(status) => changeFilter('situacao', status)}
            onUploaded={(year) => {
              if (getAppRouter().latestLocation.pathname !== '/documentos/novo') return;
              const url = new URL(window.location.href);
              url.pathname = portalPaths.institution;
              url.searchParams.set('ano', year);
              url.searchParams.delete('situacao');
              void navigateApp(url.pathname + url.search);
            }}
          />
        </section>
        <section className="page" hidden={page !== 'institution-events'}>
          <CataloguePanel
            catalogue={info.catalogue}
            canManage={permissions.manageInstitution}
            notify={notify}
          />
        </section>
        {permissions.viewOnlineUsers && page === 'online-users' ? <OnlineUsersPanel /> : null}
        {permissions.reviewCalendars ? (
          <div hidden={page !== 'review-panel'}>
            <ReviewPanel />
          </div>
        ) : null}
        {permissions.manageCampuses ? (
          <div hidden={page !== 'campuses'}>
            <CampusesPanel info={info} onCampus={showCampus} notify={notify} />
          </div>
        ) : null}
        {permissions.manageAccounts ? (
          <div hidden={page !== 'accounts'}>
            <AccountsPanel info={info} googleEnabled={status.googleEnabled} notify={notify} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
