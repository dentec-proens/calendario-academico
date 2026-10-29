import { useUpdateNavigation } from '../updates/UpdateProvider.tsx';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import {
  Building2,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  Library,
  Menu,
  Users,
  ScrollText,
} from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import { portalPaths } from '#src/app/routes.ts';
import { useAppSession } from '../session.tsx';
import { scrollIntoView } from '../../scroll.ts';

export default function WorkspaceLayout() {
  const updateNavigation = useUpdateNavigation();
  const { info, permissions, status } = useAppSession();
  const location = useRouterState({ select: (state) => state.location });
  const match = useRouterState({ select: (state) => state.matches.at(-1) });
  const metadata = match?.staticData;
  const activePath = match?.pathname ?? location.pathname;
  const [openAt, setOpenAt] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const previous = useRef(location.pathname);
  const title = metadata?.title ?? 'Calendários';
  const page = metadata?.page;
  const administration =
    page === 'review-panel' ||
    page === 'campuses' ||
    page === 'accounts' ||
    page === 'online-users' ||
    (page === 'logs' && info.user.role !== 'CAMPUS');
  const navigation = [
    ...(permissions.editCalendars
      ? [{ id: 'calendars', to: portalPaths.calendars, label: 'Calendários', Icon: CalendarDays }]
      : []),
    { id: 'institution', to: portalPaths.institution, label: 'Documentos e normas', Icon: Library },
    {
      id: 'institution-events',
      to: portalPaths['institution-events'],
      label: 'Feriados e eventos institucionais',
      Icon: CalendarRange,
    },
  ];
  const administrative = [
    ...(permissions.reviewCalendars
      ? [
          {
            id: 'review-panel',
            to: portalPaths['review-panel'],
            label: 'Revisões e pareceres',
            Icon: ClipboardCheck,
          },
        ]
      : []),
    ...(permissions.manageCampuses
      ? [{ id: 'campuses', to: portalPaths.campuses, label: 'Campi', Icon: Building2 }]
      : []),
    ...(permissions.manageAccounts
      ? [{ id: 'accounts', to: portalPaths.accounts, label: 'Contas e acessos', Icon: Users }]
      : []),
    ...(permissions.viewOnlineUsers
      ? [
          {
            id: 'online-users',
            to: portalPaths['online-users'],
            label: 'Usuários online',
            Icon: Users,
          },
        ]
      : []),
  ];
  const auditNavigation = [
    { id: 'logs', to: portalPaths.logs, label: 'Registro de operações', Icon: ScrollText },
  ];
  useEffect(() => {
    document.title = `${title} · PROENS`;
    if (previous.current === activePath) return;
    if (metadata?.creating) {
      previous.current = activePath;
      return;
    }
    const frame = requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      scrollIntoView(heading.current, { block: 'start' });
      previous.current = activePath;
    });
    return () => cancelAnimationFrame(frame);
  }, [activePath, metadata?.creating, title]);
  function links(
    items: Array<
      | (typeof navigation)[number]
      | (typeof administrative)[number]
      | (typeof auditNavigation)[number]
    >,
  ) {
    return items.map(({ id, to, label, Icon }) => (
      <Link
        onClick={updateNavigation ?? undefined}
        key={id}
        to={to}
        className={'ui-button ui-button--primary sidebar-link' + (page === id ? ' active' : '')}
        data-page={id}
        id={id === 'accounts' ? 'admin-tab' : id === 'review-panel' ? 'review-tab' : undefined}
        aria-current={page === id ? 'page' : undefined}
      >
        <Icon aria-hidden="true" size={18} /> {label}
      </Link>
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
        aria-expanded={openAt === location.pathname}
        aria-controls="portal-navigation"
        onClick={() => setOpenAt(openAt === location.pathname ? null : location.pathname)}
      >
        <Menu size={18} aria-hidden="true" /> Navegação · {title}
      </Button>
      <aside className="portal-sidebar" data-open={openAt === location.pathname}>
        <nav id="portal-navigation" aria-label="Seções do portal">
          <div className="navigation-group shared-navigation">
            <h2>Calendários e referências</h2>
            {!permissions.selectCampus ? <p>{info.campuses[0]?.name}</p> : null}
            {links(navigation)}
          </div>
          {administrative.length ? (
            <div className="navigation-group admin-navigation">
              <h2>Administração</h2>
              {links(administrative)}
            </div>
          ) : null}
          {links(auditNavigation)}
        </nav>
      </aside>
      <div className="portal-content">
        <div className="workspace-heading">
          <span className="area-badge">
            {administration ? 'Administração PROENS' : 'Calendários e referências'}
          </span>
          <h1 id="panel-title" ref={heading} tabIndex={-1}>
            {title}
          </h1>
          {!status.hosted ? (
            <p id="deployment-note" className="help">
              Desenvolvimento
            </p>
          ) : null}
        </div>
        <Suspense fallback={<p role="status">Carregando página…</p>}>
          <Outlet />
        </Suspense>
      </div>
    </section>
  );
}
