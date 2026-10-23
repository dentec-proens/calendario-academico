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
import CalendarsPanel from './CalendarsPanel.jsx';
import CataloguePanel from './CataloguePanel.jsx';
import OnlineUsersPanel from './OnlineUsersPanel.tsx';
import CampusesPanel from './CampusesPanel.jsx';
import AccountsPanel from './AccountsPanel.jsx';
import DocumentsPanel from './DocumentsPanel.jsx';
import ReviewPanel from './ReviewPanel.jsx';
import { portalPermissions, type PortalPermissions } from './permissions.ts';

type PageId =
  | 'calendars'
  | 'institution'
  | 'institution-events'
  | 'review-panel'
  | 'campuses'
  | 'accounts'
  | 'online-users';
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

function requestedPage(permissions: PortalPermissions): PageId {
  const requested = new URLSearchParams(location.search).get('page') ?? '';
  const aliases: Record<string, PageId> = {
    administration: 'accounts',
    'manage-documents': 'institution',
    'manage-events': 'institution-events',
  };
  const id = aliases[requested] ?? requested;
  return (
    [...sharedPages, ...allowedAdminPages(permissions)].find(([page]) => page === id)?.[0] ??
    'calendars'
  );
}

interface WorkspaceProps {
  info: Bootstrap;
  status: Status;
  notify: Notify;
}

export function Workspace({ info: metadata, status, notify }: WorkspaceProps) {
  const permissions = portalPermissions(metadata.user.role);
  const administrativePages = allowedAdminPages(permissions);
  const [selectedPage, setPage] = useState<PageId>(() => requestedPage(permissions));
  const page =
    adminPages.some(([id]) => id === selectedPage) &&
    !administrativePages.some(([id]) => id === selectedPage)
      ? 'calendars'
      : selectedPage;
  const [menuOpen, setMenuOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [filter, setFilter] = useState('');
  const [documentYear, setDocumentYear] = useState('');
  const [documentStatus, setDocumentStatus] = useState<'' | 'rascunho' | 'vigente' | 'arquivado'>(
    '',
  );
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
    const onPopState = () => {
      setPage(requestedPage(portalPermissions(metadata.user.role)));
      setMenuOpen(false);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [metadata.user.role]);

  function navigate(id: PageId) {
    setPage(id);
    setMenuOpen(false);
    const url = new URL(location.href);
    url.searchParams.set('page', id);
    if (id !== page) window.history.pushState(null, '', url);
    requestAnimationFrame(() => {
      headingRef.current?.focus({ preventScroll: true });
      headingRef.current?.scrollIntoView({ block: 'start' });
    });
  }

  function showCampus(id: string) {
    setFilter(id);
    navigate('calendars');
  }

  function navigationItems(items: Array<[PageId, string, LucideIcon] | AdminPage>) {
    return items.map(([id, label, Icon]) => (
      <button
        key={id}
        type="button"
        className={'sidebar-link' + (page === id ? ' active' : '')}
        data-page={id}
        id={id === 'accounts' ? 'admin-tab' : id === 'review-panel' ? 'review-tab' : undefined}
        aria-current={page === id ? 'page' : undefined}
        onClick={() => navigate(id)}
      >
        <Icon aria-hidden="true" size={18} /> {label}
      </button>
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
      <button
        type="button"
        className="secondary sidebar-toggle"
        aria-expanded={menuOpen}
        aria-controls="portal-navigation"
        onClick={() => setMenuOpen(!menuOpen)}
      >
        <Menu size={18} aria-hidden="true" /> Navegação · {title}
      </button>
      <aside className="portal-sidebar" data-open={menuOpen}>
        <nav id="portal-navigation" aria-label="Seções do portal">
          <div className="navigation-group shared-navigation">
            <h2>Calendários e referências</h2>
            {!permissions.selectCampus ? <p>{info.campuses[0]?.name}</p> : null}
            {navigationItems(sharedPages)}
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
          <p>
            {`Perfil ${info.user.role} · ${permissions.selectCampus ? 'Todos os campi' : info.campuses[0]?.name || ''}`}
          </p>
          {!status.hosted ? (
            <p id="deployment-note" className="help">
              Desenvolvimento
            </p>
          ) : null}
        </div>
        <div hidden={page !== 'calendars'}>
          <CalendarsPanel
            info={info}
            canSelectCampus={permissions.selectCampus}
            filter={filter}
            onFilter={setFilter}
            notify={notify}
            liveTrash={trashData}
            pagination={calendarPagination}
            trashPagination={trashPagination}
          />
        </div>
        <section id="institution" className="page" hidden={page !== 'institution'}>
          <DocumentsPanel
            canManage={permissions.manageInstitution}
            liveData={documentsData}
            pagination={documentPagination}
            yearFilter={documentYear}
            onYearFilter={setDocumentYear}
            statusFilter={permissions.manageInstitution ? documentStatus : ''}
            onStatusFilter={setDocumentStatus}
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
