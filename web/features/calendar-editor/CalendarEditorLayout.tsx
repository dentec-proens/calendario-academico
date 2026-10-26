import { Suspense, useEffect, useRef } from 'react';
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { CalendarEditorProvider, useCalendarEditor } from './session/CalendarEditorProvider.tsx';
import { EventEditorProvider, useEventEditor } from './events/EventEditorProvider.tsx';
import { CalendarExportProvider, useCalendarExport } from './export/CalendarExportProvider.tsx';
import { confirmAction } from '../../components/confirmation.ts';
import { editorSections } from '../../../src/app-routes.ts';
import { useCalendarSummaryTool } from '../../shared/integrations/webmcp.ts';
import './calendar-editor.css';
import { HistoryAnalysisProvider } from './history/useHistoryAnalysis.tsx';
import { useSessionState } from '../../app/session.tsx';
import { scrollIntoView, trackScrollInset } from '../../scroll.ts';
import ImportCalendarForm from './forms/ImportCalendarForm.tsx';
import { useFormDrafts } from '../../shared/forms/drafts.tsx';

function EditorFrame() {
  const {
    record,
    state,
    dirty,
    unapplied,
    status,
    error,
    remote,
    connected,
    session,
    evaluation,
    readOnly,
    notify,
    formEpoch,
  } = useCalendarEditor();
  const { context, resume } = useEventEditor();
  const { message } = useSessionState();
  const exporting = useCalendarExport();
  const navigate = useNavigate();
  const drafts = useFormDrafts();
  const pathname = useRouterState({ select: (router) => router.matches.at(-1)?.pathname });
  const feedback = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousPath = useRef(pathname);
  useCalendarSummaryTool(state, evaluation, !dirty);
  useEffect(() => {
    document.body.classList.add('calendar-editor');
    return () => document.body.classList.remove('calendar-editor');
  }, []);
  useEffect(() => {
    if (feedback.current) return trackScrollInset(feedback.current);
  }, []);
  useEffect(() => {
    if (previousPath.current === pathname) return;
    // The history form reveals and focuses its file control when it mounts.
    if (!readOnly && pathname?.endsWith('/historico')) {
      previousPath.current = pathname;
      return;
    }
    const frame = requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      scrollIntoView(heading.current, { block: 'start' });
      previousPath.current = pathname;
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, readOnly]);
  const labels = {
    edit: 'Dados gerais',
    periods: 'Períodos e avaliações',
    days: 'Sábados e férias',
    events: 'Eventos locais',
    history: 'Calendário anterior',
    issues: 'Conferência e exportação',
    calendar: 'Visualizar calendário',
  };
  const paths = {
    edit: '/calendarios/$calendarId/editar',
    periods: '/calendarios/$calendarId/periodos',
    days: '/calendarios/$calendarId/dias',
    events: '/calendarios/$calendarId/eventos',
    history: '/calendarios/$calendarId/historico',
    issues: '/calendarios/$calendarId/pendencias',
    calendar: '/calendarios/$calendarId/visualizar',
  } as const;
  const current =
    (Object.keys(editorSections) as (keyof typeof editorSections)[]).find((key) =>
      pathname?.endsWith('/' + editorSections[key]),
    ) || 'edit';
  return (
    <div className="calendar-editor-content">
      <div className="editor-navigation" aria-label="Navegação do calendário">
        <Link to={readOnly ? '/revisoes' : '/calendarios'} className="portal-back">
          ← {readOnly ? 'Voltar às revisões e pareceres' : 'Voltar aos calendários'}
        </Link>
        {!readOnly && (
          <Link to="/logs" className="editor-history">
            Histórico de alterações
          </Link>
        )}
      </div>
      <div className="intro">
        <div>
          <h1 id="record-title">{record.name}</h1>
          <p id="record-heading">
            {record.purpose === 'test' ? 'Calendário de teste' : 'Calendário definitivo'} · Versão{' '}
            {record.version}
          </p>
        </div>
        <div className="actions">
          <ImportCalendarForm />
          <Link
            className="editor-action secondary"
            to="/calendarios/$calendarId/visualizar"
            params={{ calendarId: record.id }}
          >
            Visualizar calendário
          </Link>
          <Link
            id="open-history"
            className="editor-action"
            to="/calendarios/$calendarId/historico"
            params={{ calendarId: record.id }}
          >
            Enviar calendário anterior
          </Link>
          <button
            id="download-pdf-top"
            disabled={exporting.pending}
            onClick={() => {
              void exporting.pdf();
            }}
          >
            Baixar calendário em PDF
          </button>
          {!readOnly && record.purpose === 'test' && (
            <button
              id="make-definitive"
              type="button"
              disabled={exporting.pending}
              onClick={exporting.makeDefinitive}
            >
              Tornar definitivo
            </button>
          )}
          <button id="save" className="secondary" onClick={exporting.copy}>
            Baixar cópia
          </button>
        </div>
      </div>
      <div className="editor-feedback" ref={feedback}>
        <div
          id="message"
          className={message?.error ? 'error' : ''}
          role="status"
          aria-live="polite"
        >
          {message?.text}
        </div>
        <div className="autosave-panel" aria-label="Salvamento do calendário">
          <p id="autosave-status" role="status" aria-live="polite" data-state={status}>
            {readOnly
              ? 'Consulta em modo somente leitura.'
              : !connected
                ? 'Conexão interrompida. Mantenha a página aberta até confirmar o salvamento.'
                : error ||
                  {
                    idle: 'Salvamento automático ativo.',
                    scheduled: 'Alterações aplicadas. Salvamento agendado…',
                    saving: 'Salvando calendário…',
                    pending: 'Há alterações aplicadas aguardando salvamento.',
                    saved: 'Calendário salvo e confirmado.',
                    blocked: 'Salvamento bloqueado. Confira o conflito.',
                    error: 'Não foi possível salvar.',
                  }[status]}
          </p>
          {!readOnly && (status === 'error' || status === 'blocked') && (
            <div className="actions">
              <button
                id="server-save"
                type="button"
                className="secondary"
                onClick={() => {
                  void session.retry();
                }}
              >
                Tentar novamente
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  void confirmAction({
                    title: 'Sair sem salvar as alterações locais?',
                    description:
                      'Baixe uma cópia dos dados aplicados antes de sair, se desejar preservá-los.',
                    consequence:
                      'Os campos não aplicados e as alterações ainda não confirmadas serão descartados. Uma gravação já enviada pode concluir no servidor.',
                    confirmLabel: 'Sair sem salvar',
                    intent: 'warning',
                    onConfirm: async () => {
                      session.abandon();
                      drafts?.clearScope(`calendar:${record.id}:`);
                      await navigate({ to: '/calendarios' });
                    },
                  });
                }}
              >
                Sair sem salvar
              </button>
            </div>
          )}
          <p id="unapplied-status" className="help" role="status" hidden={!unapplied}>
            Há alterações no formulário. Use Adicionar ou Aplicar para incluí-las.
          </p>
          {remote && (
            <p className="notice">
              O calendário ou a base mudou em outra sessão. Suas alterações foram preservadas.
              Confira os campos antes de reabrir.
            </p>
          )}
          {!readOnly &&
            record.catalogueRevision !==
              (remote?.currentCatalogueRevision ?? record.currentCatalogueRevision) && (
              <button
                type="button"
                onClick={() => {
                  void session
                    .confirmBase()
                    .catch((cause: unknown) =>
                      notify(
                        cause instanceof Error
                          ? cause.message
                          : 'Não foi possível confirmar a base.',
                        true,
                      ),
                    );
                }}
              >
                Confirmar atualização da base
              </button>
            )}
          {remote && (
            <button
              type="button"
              onClick={() => {
                void confirmAction({
                  title: 'Reabrir calendário atualizado?',
                  description:
                    'Confira ou baixe uma cópia das alterações aplicadas antes de continuar.',
                  consequence: 'Os campos não aplicados e as alterações locais serão descartados.',
                  confirmLabel: 'Reabrir calendário',
                  intent: 'warning',
                  onConfirm: async () => {
                    if (session.getSnapshot().status === 'saving') await session.flush();
                    session.dispose();
                    window.location.reload();
                  },
                });
              }}
            >
              Reabrir calendário atualizado
            </button>
          )}
        </div>
      </div>
      {context && (
        <button
          id="resume-event"
          type="button"
          className="secondary"
          onClick={() => {
            void resume();
          }}
        >
          Continuar preenchimento
        </button>
      )}
      <div className="workspace sequential-editor">
        <section className="main-column">
          <div className="metrics">
            <article>
              <span>Dias letivos calculados</span>
              <strong id="total">{evaluation?.total ?? '—'}</strong>
              <small id="goal">
                {state.year === 2027
                  ? 'Referência: mínimo anual de 200 dias.'
                  : 'Sem meta normativa cadastrada para este ano.'}
              </small>
            </article>
            <article>
              <span>Períodos cadastrados</span>
              <strong id="period-count">{state.periods.length}</strong>
              <small id="period-summary">
                {state.periods.length
                  ? state.periods.map((period) => period.name).join(' · ')
                  : 'Nenhum período definido'}
              </small>
            </article>
            <article>
              <span>Situação</span>
              <strong className="status-title">
                {record.readiness.ready && !dirty ? 'Conferência registrada' : 'Em elaboração'}
              </strong>
              <small>Não representa aprovação institucional</small>
            </article>
          </div>
          <div className="editor-sections-layout">
            <aside className="editor-sidebar">
              <nav aria-label="Seções do editor">
                {(Object.keys(paths) as (keyof typeof paths)[]).map((key, index) => (
                  <Link
                    key={key}
                    to={paths[key]}
                    params={{ calendarId: record.id }}
                    className={`tab ${current === key ? 'active' : ''}`}
                    data-view={key}
                    aria-current={current === key ? 'page' : undefined}
                  >
                    {index + 1}. {labels[key]}
                  </Link>
                ))}
              </nav>
            </aside>
            <div className="editor-section-content">
              <h2 id="editor-section-title" ref={heading} tabIndex={-1}>
                {labels[current]}
              </h2>
              <Suspense fallback={<p role="status">Carregando seção…</p>}>
                <Outlet key={formEpoch} />
              </Suspense>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function CalendarEditorLayout({ calendarId }: { calendarId: string }) {
  return (
    <CalendarEditorProvider calendarId={calendarId}>
      <CalendarExportProvider>
        <HistoryAnalysisProvider>
          <EventEditorProvider>
            <EditorFrame />
          </EventEditorProvider>
        </HistoryAnalysisProvider>
      </CalendarExportProvider>
    </CalendarEditorProvider>
  );
}
