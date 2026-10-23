import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { Bootstrap, DocumentsData, Notify, Status, TrashData } from '../native/types.ts';
import { Building2, CalendarDays, ClipboardCheck, Library } from 'lucide-react';
import CalendarsPanel from './CalendarsPanel.jsx';
import CataloguePanel from './CataloguePanel.jsx';
import AdministrationPanel from './AdministrationPanel.jsx';
import DocumentsPanel from './DocumentsPanel.jsx';
import ReviewPanel from './ReviewPanel.jsx';

type PageId = 'calendars' | 'institution' | 'review-panel' | 'administration';
interface WorkspaceProps {
  info: Bootstrap;
  status: Status;
  notify: Notify;
  documentsData: DocumentsData | undefined;
  trashData: TrashData | undefined;
}

export function Workspace({ info, status, notify, documentsData, trashData }: WorkspaceProps) {
  const [page, setPage] = useState<PageId>('calendars');
  const [filter, setFilter] = useState('');
  const isAdmin = info.user.role === 'ADMIN';
  const tabs: Array<[PageId, string, LucideIcon]> = [
    ['calendars', 'Calendários', CalendarDays],
    ['institution', 'Base institucional', Library],
    ...(isAdmin
      ? [
          ['review-panel', 'Revisão do parecer', ClipboardCheck] as [PageId, string, LucideIcon],
          ['administration', 'Campi e contas', Building2] as [PageId, string, LucideIcon],
        ]
      : []),
  ];

  function showCampus(id: string) {
    setFilter(id);
    setPage('calendars');
    requestAnimationFrame(() =>
      document.getElementById('calendar-list')?.scrollIntoView({ behavior: 'smooth' }),
    );
  }

  return (
    <section id="workspace">
      <div className="intro">
        <div>
          <p className="eyebrow">CALENDÁRIOS ACADÊMICOS E ADMINISTRATIVOS</p>
          <h1 id="panel-title">
            {isAdmin
              ? 'Painel ADMIN · Todos os campi'
              : 'Painel Campus · ' + (info.campuses[0]?.name || '')}
          </h1>
          <p id="access-scope">
            {isAdmin
              ? 'Visualize os calendários de todos os campi e gerencie a base institucional.'
              : 'Seu acesso permite consultar e alterar somente os calendários do seu campus.'}
          </p>
          <p>Base institucional compartilhada, com decisões locais preservadas.</p>
        </div>
      </div>
      <p className="notice" id="deployment-note">
        {status.hosted
          ? 'Ambiente online. Dados e documentos são armazenados na base compartilhada da instituição.'
          : 'Ambiente local de desenvolvimento. As contas desta instalação compartilham a mesma base. O acesso remoto dos campi depende da implantação institucional.'}
      </p>
      <nav aria-label="Seções do portal">
        {tabs.map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            className={'tab' + (page === id ? ' active' : '')}
            data-page={id}
            id={
              id === 'administration'
                ? 'admin-tab'
                : id === 'review-panel'
                  ? 'review-tab'
                  : undefined
            }
            aria-current={page === id ? 'page' : undefined}
            onClick={() => setPage(id)}
          >
            <Icon aria-hidden="true" size={18} />
            {label}
          </button>
        ))}
      </nav>
      <div hidden={page !== 'calendars'}>
        <CalendarsPanel
          info={info}
          isAdmin={isAdmin}
          filter={filter}
          onFilter={setFilter}
          notify={notify}
          liveTrash={trashData}
        />
      </div>
      <section id="institution" className="page" hidden={page !== 'institution'}>
        <DocumentsPanel isAdmin={isAdmin} liveData={documentsData} />
        <CataloguePanel catalogue={info.catalogue} isAdmin={isAdmin} notify={notify} />
      </section>
      {isAdmin ? (
        <>
          <div hidden={page !== 'review-panel'}>
            <ReviewPanel calendars={info.calendars} />
          </div>
          <div hidden={page !== 'administration'}>
            <AdministrationPanel
              info={info}
              googleEnabled={status.googleEnabled}
              onCampus={showCampus}
              notify={notify}
            />
          </div>
        </>
      ) : null}
    </section>
  );
}
