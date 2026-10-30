import { LoadingIndicator } from '../../components/ui/LoadingIndicator.tsx';
import { EditorErrorBoundary } from './EditorErrorBoundary.tsx';
import { Suspense, useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, Check, Download, Ellipsis, Eye, History } from 'lucide-react';
import { BackLink } from '../../components/ui/BackLink.tsx';
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { CalendarEditorProvider, useCalendarEditor } from './session/CalendarEditorProvider.tsx';
import { EventEditorProvider, useEventEditor } from './events/EventEditorProvider.tsx';
import EventPanel from './events/EventPanel.tsx';
import { CalendarExportProvider, useCalendarExport } from './export/CalendarExportProvider.tsx';
import { confirmAction } from '../../components/confirmation.ts';
import { editorSections } from '#src/app/routes.ts';
import { editorPages, editorSteps, editorNavigation, continueLabel } from './editor-steps.ts';
import { offerIds, labelFor } from '#src/domain/calendar/offers.ts';
import EditorSteps from './EditorSteps.tsx';
import TeachingDaySummary from './TeachingDaySummary.tsx';
import BaseUpdateCard from './BaseUpdateCard.tsx';
import { useCalendarSummaryTool } from '../../shared/integrations/webmcp.ts';
import './calendar-editor.css';
import { useAppSession, useSessionState } from '../../app/session.tsx';
import { scrollIntoView, trackScrollInset } from '../../scroll.ts';
import ImportCalendarForm from './forms/ImportCalendarForm.tsx';
import { useFormDrafts } from '../../shared/forms/drafts.tsx';
import { Notice } from '../../components/ui/Notice.tsx';

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
    formEpoch,
  } = useCalendarEditor();
  const { context, resume, open: eventEditorOpen } = useEventEditor();
  const { message } = useSessionState();
  const { permissions } = useAppSession();
  const exporting = useCalendarExport();
  const navigate = useNavigate();
  const drafts = useFormDrafts();
  const pathname = useRouterState({ select: (router) => router.matches.at(-1)?.pathname });
  const hash = useRouterState({ select: (router) => router.location.hash });
  const feedback = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousPath = useRef(pathname);
  useCalendarSummaryTool(state, evaluation, !dirty);
  useEffect(() => {
    document.body.classList.add('calendar-editor');
    return () => document.body.classList.remove('calendar-editor');
  }, []);
  // The editor sits outside the workspace layout, which names the tab for every other page.
  useEffect(() => {
    document.title = `${record.name} · PROENS`;
  }, [record.name]);
  useEffect(() => {
    if (feedback.current) return trackScrollInset(feedback.current);
  }, []);
  useEffect(() => {
    if (previousPath.current === pathname) return;
    // The assessment block (or its event panel) owns focus for this explicit destination.
    if (pathname?.endsWith('/periodos') && hash === 'assessment-area') {
      previousPath.current = pathname;
      return;
    }
    const frame = requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      scrollIntoView(heading.current, { block: 'start' });
      previousPath.current = pathname;
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, hash]);
  const currentSection =
    (Object.keys(editorSections) as (keyof typeof editorSections)[]).find((key) =>
      pathname?.endsWith('/' + editorSections[key]),
    ) || 'edit';
  const {
    current,
    active: activeStep,
    stepIndex,
    previous,
    next,
  } = editorNavigation(currentSection);
  const needsAttention =
    !connected ||
    Boolean(error || remote || unapplied) ||
    status === 'error' ||
    status === 'blocked';
  // A change from another session or a lost connection needs attention even in read-only mode.
  const autosaveTone =
    !readOnly && (error || status === 'error' || status === 'blocked')
      ? 'danger'
      : !connected || remote
        ? 'warning'
        : 'info';
  const saveLabel = readOnly
    ? 'Somente leitura'
    : !connected
      ? 'Sem conexão'
      : unapplied
        ? 'Campos ainda em preenchimento'
        : {
            idle: '',
            scheduled: 'Alterações ainda não salvas',
            saving: 'Salvando…',
            pending: 'Alterações ainda não salvas',
            saved: 'Alterações salvas',
            blocked: 'Alterações não salvas',
            error: 'Alterações não salvas',
          }[status];
  return (
    <div className="calendar-editor-content">
      {permissions.editCalendars ? (
        <BackLink to="/calendarios" className="editor-back">
          Calendários
        </BackLink>
      ) : (
        <BackLink
          to="/revisoes/$calendarId"
          params={{ calendarId: record.id }}
          className="editor-back"
        >
          Revisões e pareceres
        </BackLink>
      )}
      <div className="editor-intro">
        <div className="editor-heading-group">
          <div className="editor-title-row">
            <h1 id="record-title" tabIndex={-1}>
              {record.name}
            </h1>
          </div>
          <p id="record-heading">
            <span className="editor-purpose">
              {record.purpose === 'test' ? 'Calendário de teste' : 'Calendário definitivo'}
            </span>
            <span className="editor-heading-status">
              Versão {record.version} ·{' '}
              {record.readiness.ready && !dirty ? 'Conferência registrada' : 'Em elaboração'}
            </span>
          </p>
        </div>
        <div className="editor-header-actions">
          <Link
            className="editor-action secondary"
            to={editorPages.calendar.path}
            params={{ calendarId: record.id }}
            search={(previous) => previous}
            data-view="calendar"
            aria-label={editorPages.calendar.title}
          >
            <Eye aria-hidden="true" /> <span>{editorPages.calendar.title}</span>
          </Link>
          <details
            className="editor-more"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.currentTarget.open = false;
                event.currentTarget.querySelector('summary')?.focus();
              }
            }}
          >
            <summary aria-label="Mais ações">
              <Ellipsis aria-hidden="true" />
            </summary>
            <div
              className="editor-more-content"
              onClick={(event) => {
                if ((event.target as HTMLElement).closest('a, button')) {
                  const menu = event.currentTarget.closest('details');
                  menu?.removeAttribute('open');
                  menu?.querySelector('summary')?.focus();
                }
              }}
            >
              {!readOnly && (
                <Link
                  to="/logs"
                  className="editor-history"
                  aria-label="Histórico de alterações"
                  aria-describedby="calendar-history-description"
                  title="Consulte as operações registradas e a autoria das alterações."
                >
                  <History aria-hidden="true" />
                  <span className="editor-menu-copy">
                    <span>Histórico de alterações</span>
                    <small id="calendar-history-description">Consultar operações registradas</small>
                  </span>
                </Link>
              )}
              {!readOnly && <ImportCalendarForm />}
              <button
                id="save"
                type="button"
                className="secondary"
                onClick={exporting.copy}
                aria-label="Baixar cópia"
                aria-describedby="download-copy-description"
                title="Baixe uma cópia editável (.json) dos dados já incluídos no calendário para importar depois. Campos ainda em preenchimento não entram nessa cópia; o PDF fica na revisão."
              >
                <Download aria-hidden="true" />
                <span className="editor-menu-copy">
                  <span>Baixar cópia</span>
                  <small id="download-copy-description">
                    Guardar os dados já incluídos (.json)
                  </small>
                </span>
              </button>
            </div>
          </details>
        </div>
      </div>
      <dl className="editor-calendar-details" aria-label="Dados gerais do calendário">
        <div>
          <dt>Forma de oferta/nível</dt>
          <dd id="selected-modalities">
            <ul className="editor-offer-list" aria-label="Formas de oferta e níveis">
              {offerIds(state).map((item) => (
                <li key={item}>{labelFor(state, item)}</li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>
      <div className="editor-feedback" ref={feedback}>
        <div id="message" role="status" aria-live="polite">
          {message?.text ? (
            <Notice tone={message.error ? 'danger' : 'success'} elevated>
              {message.text}
            </Notice>
          ) : null}
        </div>
        <Notice
          className="autosave-panel"
          tone={autosaveTone}
          aria-label="Salvamento do calendário"
          hidden={!needsAttention && !readOnly}
        >
          <p
            id="autosave-status"
            role="status"
            aria-live="polite"
            data-state={status}
            hidden={!readOnly && connected && !error && (status === 'idle' || status === 'saved')}
          >
            {readOnly
              ? 'Consulta em modo somente leitura.'
              : !connected
                ? 'Conexão interrompida. Mantenha a página aberta até confirmar o salvamento.'
                : error ||
                  {
                    idle: '',
                    scheduled: 'As alterações ainda não foram salvas.',
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
            {currentSection === 'edit'
              ? 'Há campos em preenchimento. Corrija as pendências da semana letiva ou confirme os demais formulários.'
              : 'Há campos em preenchimento. Confirme o formulário para incluir essas alterações no calendário.'}
          </p>
          {remote && (
            <p id="editor-remote-change">
              O calendário ou a base mudou em outra sessão. Suas alterações foram preservadas.
              Confira os campos antes de reabrir.
            </p>
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
                    drafts?.clearScope(`calendar:${record.id}:`);
                    session.reopenRemote();
                  },
                });
              }}
            >
              Reabrir calendário atualizado
            </button>
          )}
        </Notice>
        <TeachingDaySummary key={currentSection} />
      </div>
      <BaseUpdateCard />
      {context && !eventEditorOpen && (
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
      <div
        className={`editor-sections-layout ${currentSection === 'calendar' ? 'editor-preview-layout' : ''}`}
      >
        <EditorSteps calendarId={record.id} current={currentSection} />
        <div className="editor-section-content">
          <div className="editor-section-heading">
            <p className="editor-eyebrow">
              {activeStep
                ? `Etapa ${stepIndex + 1} de ${editorSteps.length}`
                : 'Visualização do calendário'}
            </p>
            <h2 id="editor-section-title" ref={heading} tabIndex={-1}>
              {current.title}
            </h2>
            <p className="editor-section-description">{current.description}</p>
          </div>
          <Suspense fallback={<LoadingIndicator layout="overlay" label="Carregando seção…" />}>
            <Outlet key={formEpoch} />
          </Suspense>
          <EditorErrorBoundary>
            <EventPanel key={`panel-${formEpoch}`} />
          </EditorErrorBoundary>
          <div className="editor-step-footer">
            <div className="editor-footer-leading">
              {previous && (
                <Link
                  className="editor-previous"
                  to={previous.path}
                  params={{ calendarId: record.id }}
                  search={(previous) => previous}
                >
                  <ArrowLeft aria-hidden="true" /> Voltar
                </Link>
              )}
              <span className="editor-save-indicator" role="status" aria-live="polite">
                {status === 'saved' && connected && !readOnly && !unapplied && (
                  <Check aria-hidden="true" />
                )}
                {saveLabel}
              </span>
            </div>
            {(currentSection === 'edit' || currentSection === 'periods') && !readOnly && next ? (
              <button
                id="editor-continue"
                type="submit"
                form={currentSection === 'periods' ? 'organization-continue' : 'week-form'}
              >
                {continueLabel(next)} <ArrowRight aria-hidden="true" />
              </button>
            ) : next ? (
              <Link
                id="editor-continue"
                className="editor-action"
                to={next.path}
                params={{ calendarId: record.id }}
                search={(previous) => previous}
              >
                {continueLabel(next)}
                <ArrowRight aria-hidden="true" />
              </Link>
            ) : currentSection === 'calendar' ? (
              <Link
                className="editor-action secondary"
                to={editorPages.issues.path}
                params={{ calendarId: record.id }}
                search={(previous) => previous}
              >
                <ArrowLeft aria-hidden="true" /> Voltar à revisão
              </Link>
            ) : !readOnly && record.purpose === 'test' ? (
              <button
                id="make-definitive"
                type="button"
                disabled={exporting.pending}
                onClick={exporting.makeDefinitive}
              >
                <Check aria-hidden="true" /> Concluir e tornar definitivo
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CalendarEditorLayout({ calendarId }: { calendarId: string }) {
  return (
    <CalendarEditorProvider calendarId={calendarId}>
      <CalendarExportProvider>
        <EventEditorProvider>
          <EditorErrorBoundary>
            <EditorFrame />
          </EditorErrorBoundary>
        </EventEditorProvider>
      </CalendarExportProvider>
    </CalendarEditorProvider>
  );
}
