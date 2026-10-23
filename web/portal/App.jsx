import { useCallback, useEffect, useRef, useState } from 'react';
import { Building2, CalendarDays, ClipboardCheck, Library, LogOut, RefreshCw } from 'lucide-react';
import { api } from './api.js';
import { useAction } from './useAction.js';
import AuthPanel from './AuthPanel.jsx';
import CalendarsPanel from './CalendarsPanel.jsx';
import CataloguePanel from './CataloguePanel.jsx';
import AdministrationPanel from './AdministrationPanel.jsx';
import DocumentsPanel from './DocumentsPanel.jsx';
import ReviewPanel from './ReviewPanel.jsx';

export function Workspace({ info, status, onRefresh, notify, documentsData, trashData }) {
  const [page, setPage] = useState('calendars');
  const [filter, setFilter] = useState('');
  const isAdmin = info.user.role === 'ADMIN';
  const tabs = [
    ['calendars', 'Calendários', CalendarDays],
    ['institution', 'Base institucional', Library],
    ...(isAdmin
      ? [
          ['review-panel', 'Revisão do parecer', ClipboardCheck],
          ['administration', 'Campi e contas', Building2],
        ]
      : []),
  ];

  function showCampus(id) {
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
          onRefresh={onRefresh}
          notify={notify}
          liveTrash={trashData}
        />
      </div>
      <section id="institution" className="page" hidden={page !== 'institution'}>
        <DocumentsPanel
          isAdmin={isAdmin}
          onChanged={onRefresh}
          refreshKey={info.catalogue.revision}
          liveData={documentsData}
        />
        <CataloguePanel
          catalogue={info.catalogue}
          isAdmin={isAdmin}
          onRefresh={onRefresh}
          notify={notify}
        />
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
              onRefresh={onRefresh}
              onCampus={showCampus}
              notify={notify}
            />
          </div>
        </>
      ) : null}
    </section>
  );
}

export default function App() {
  const [status, setStatus] = useState(null);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const sessionGeneration = useRef(0);
  const [message, setMessage] = useState(() =>
    new URLSearchParams(window.location.search).has('google_error')
      ? {
          text: 'Não foi possível entrar. Use a conta Google institucional @ifpr.edu.br autorizada pelo ADMIN e tente novamente.',
          error: true,
        }
      : null,
  );
  const notify = useCallback(
    (text, error = false) =>
      setMessage({ text: new Date().toLocaleTimeString('pt-BR') + ' — ' + text, error }),
    [],
  );
  const refresh = useCallback(async () => {
    const generation = sessionGeneration.current;
    const bootstrap = await api('/api/bootstrap');
    if (generation === sessionGeneration.current) setInfo(bootstrap);
  }, []);
  const load = useCallback(async (signal) => {
    const generation = ++sessionGeneration.current;
    const nextStatus = await api('/api/status', 'GET', undefined, { signal });
    const bootstrap = nextStatus.user
      ? await api('/api/bootstrap', 'GET', undefined, { signal })
      : null;
    if (generation === sessionGeneration.current && !signal?.aborted) {
      setStatus(nextStatus);
      setInfo(bootstrap);
    }
  }, []);
  const { pending, run } = useAction(notify);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .catch((error) => {
        if (error.name !== 'AbortError') notify(error.message, true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [load, notify]);

  return (
    <>
      <header>
        <div className="brand">P</div>
        <div>
          <strong>PROENS - Pró-Reitoria de Ensino</strong>
          <div className="muted">Assistente de Calendário PROENS</div>
        </div>
        <span className="badge" id="account">
          {info ? `${info.user.name} · ${info.user.role}` : 'Instalação local'}
        </span>
        {info ? (
          <button
            type="button"
            id="logout"
            className="secondary"
            disabled={pending}
            onClick={() =>
              run(async () => {
                await api('/api/logout', 'POST', {});
                sessionGeneration.current += 1;
                setInfo(null);
                setStatus((previous) => ({ ...previous, user: null }));
                await load();
                notify('Sessão encerrada.');
              })
            }
          >
            <LogOut aria-hidden="true" size={18} />
            Sair
          </button>
        ) : null}
      </header>
      <main>
        <div
          id="message"
          className={message?.error ? 'error' : ''}
          role="status"
          aria-live="polite"
        >
          {message?.text}
        </div>
        {loading ? (
          <p role="status">Carregando portal…</p>
        ) : status ? (
          info ? (
            <Workspace
              key={info.user.id}
              info={info}
              status={status}
              onRefresh={refresh}
              notify={notify}
            />
          ) : (
            <AuthPanel status={status} onLogin={load} notify={notify} />
          )
        ) : (
          <div className="panel">
            <p>Não foi possível carregar o portal.</p>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  await load();
                  setMessage(null);
                })
              }
            >
              <RefreshCw aria-hidden="true" size={18} />
              Tentar novamente
            </button>
          </div>
        )}
      </main>
    </>
  );
}
