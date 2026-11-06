import { LoadingIndicator } from '../../components/ui/LoadingIndicator.tsx';
import { EditorErrorBoundary } from './EditorErrorBoundary.tsx';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Eye } from 'lucide-react';
import LifecycleActions, {
  CalendarStatusBadge,
  ReturnNote,
} from '../lifecycle/LifecycleActions.tsx';
import {
  ReturnComparison,
  diffSummary,
  useReturnComparison,
} from '../lifecycle/SubmissionComparison.tsx';
import type { DiffSide } from '#src/domain/calendar/diff.ts';
import { BackLink } from '../../components/ui/BackLink.tsx';
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { CalendarEditorProvider, useCalendarEditor } from './session/CalendarEditorProvider.tsx';
import { EventEditorProvider, useEventEditor } from './events/EventEditorProvider.tsx';
import EditorNotices from './EditorNotices.tsx';
import EventPanel from './events/EventPanel.tsx';
import NewEventButton from './events/NewEventButton.tsx';
import { SectionActionsProvider } from './section-actions.tsx';
import { CalendarExportProvider, useCalendarExport } from './export/CalendarExportProvider.tsx';
import { confirmAction } from '../../components/confirmation.ts';
import { editorSections } from '#src/app/routes.ts';
import {
  editorPages,
  editorSteps,
  editorNavigation,
  continueLabel,
  stepIssueCounts,
} from './editor-steps.ts';
import { offerIds, labelFor } from '#src/domain/calendar/offers.ts';
import { contentIssues } from '#src/domain/calendar/readiness.ts';
import EditorSteps from './EditorSteps.tsx';
import TeachingDaySummary from './TeachingDaySummary.tsx';
import BaseChangesNotice from './BaseChangesNotice.tsx';
import { useCalendarSummaryTool } from '../../shared/integrations/webmcp.ts';
import './calendar-editor.css';
import { useAppSession, useSessionState } from '../../app/session.tsx';
import { scrollIntoView, trackScrollInset } from '../../scroll.ts';
import EditorMoreMenu from './EditorMoreMenu.tsx';
import { useFormDrafts } from '../../shared/forms/drafts.tsx';
import { Notice } from '../../components/ui/Notice.tsx';
import { IdentityPanelProvider, IdentitySummary } from './identity/CalendarIdentity.tsx';
import { CalendarTitle } from './identity/CalendarName.tsx';
import { missingCoursesIssue } from '#src/domain/calendar/identity.ts';

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
    baseEvents,
    session,
    evaluation,
    readOnly,
    locked,
    role,
    notify,
    formEpoch,
    removal,
  } = useCalendarEditor();
  const { context, resume, open: eventEditorOpen } = useEventEditor();
  const { message } = useSessionState();
  const { permissions } = useAppSession();
  const exporting = useCalendarExport();
  const currentContent = useMemo<DiffSide>(
    () => ({
      state,
      institutionalSnapshot: baseEvents,
      documentSnapshot: locked ? record.documentSnapshot : record.currentDocuments,
      catalogueRevision: locked ? record.catalogueRevision : record.currentCatalogueRevision,
    }),
    [
      state,
      baseEvents,
      locked,
      record.documentSnapshot,
      record.currentDocuments,
      record.catalogueRevision,
      record.currentCatalogueRevision,
    ],
  );
  const returned = record.status === 'devolvido' ? record.lastReturn : null;
  const sinceReturn = useReturnComparison(
    record.id,
    returned?.submissionId,
    returned ? currentContent : null,
  );
  const navigate = useNavigate();
  const drafts = useFormDrafts();
  const pathname = useRouterState({ select: (router) => router.matches.at(-1)?.pathname });
  const hash = useRouterState({ select: (router) => router.location.hash });
  const feedback = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [sectionActions, setSectionActions] = useState<HTMLDivElement | null>(null);
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
  const issues = useMemo(() => contentIssues(state, baseEvents), [state, baseEvents]);
  const openIssues = useMemo(() => issues.map((issue) => issue.message), [issues]);
  const stepCounts = useMemo(() => stepIssueCounts(issues), [issues]);
  // The backend refuses these submissions too; saying why beats an error after confirming.
  const submitUnavailable = !connected
    ? 'Sem conexão. O envio volta a ficar disponível quando a conexão for restabelecida.'
    : remote
      ? 'O calendário mudou em outra sessão. Reabra-o antes de enviar.'
      : status === 'error' || status === 'blocked'
        ? 'Resolva o salvamento das alterações antes de enviar.'
        : !record.courses
          ? missingCoursesIssue
          : undefined;
  // Shared by the header and by the review step's footer, which repeats only the submission.
  const lifecycle = {
    calendar: record,
    role,
    notify,
    submitSummary: returned ? diffSummary(sinceReturn) : undefined,
    unavailable: submitUnavailable ? { submit: submitUnavailable } : undefined,
    submitIssues: openIssues,
    prepare: async () => {
      if (session.getSnapshot().unapplied)
        throw new Error('Aplique ou descarte os campos em edição antes de enviar.');
      return session.prepareSubmission();
    },
  };
  const saveLabel = readOnly
    ? 'Somente leitura'
    : !connected
      ? 'Sem conexão'
      : unapplied
        ? 'Alterações ainda não incluídas'
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
          <CalendarTitle />
          <div id="record-heading" className="editor-meta">
            <CalendarStatusBadge status={record.status} />
            {record.seiProcess ? <span>Processo SEI nº {record.seiProcess}</span> : null}
            {record.supersededByName ? (
              <span>Substituído por {record.supersededByName}</span>
            ) : null}
            <ul
              id="selected-modalities"
              className="editor-offer-list"
              aria-label="Formas de oferta e níveis"
            >
              {offerIds(state).map((item) => (
                <li key={item}>{labelFor(state, item)}</li>
              ))}
            </ul>
          </div>
          <IdentitySummary />
        </div>
        <div className="editor-header-actions">
          <Link
            className="editor-action secondary"
            to={editorPages.calendar.path}
            params={{ calendarId: record.id }}
            search={(previous) => previous}
            data-view="calendar"
            title={editorPages.calendar.title}
          >
            <Eye aria-hidden="true" /> <span>Visualizar</span>
          </Link>
          <EditorMoreMenu calendarId={record.id} readOnly={readOnly} onCopy={exporting.copy} />
        </div>
        {permissions.editCalendars ? (
          <LifecycleActions className="editor-lifecycle" {...lifecycle} />
        ) : null}
      </div>
      {locked && permissions.editCalendars ? (
        <p className="help" id="editor-locked">
          {record.status === 'vigente'
            ? 'Calendário publicado. Para alterá-lo, crie uma nova versão na lista de calendários.'
            : record.status === 'enviado'
              ? 'Calendário enviado para análise. Recolha o envio para voltar a editar.'
              : 'Calendário em análise ou concluído: a edição volta após uma devolução.'}
        </p>
      ) : null}
      {returned ? (
        <ReturnNote lastReturn={returned}>
          <ReturnComparison
            calendarId={record.id}
            returnedSubmissionId={returned.submissionId}
            sequence={returned.sequence}
            diff={sinceReturn}
          />
        </ReturnNote>
      ) : record.status === 'rascunho' && record.lastReturn ? (
        <ReturnNote lastReturn={record.lastReturn} />
      ) : null}
      <div className="editor-feedback" ref={feedback}>
        <div id="message" role="status" aria-live="polite">
          <EditorNotices
            message={message}
            removal={removal}
            // The step's title keeps the place.
            onUndone={() => heading.current?.focus({ preventScroll: true })}
          />
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
              {status === 'error' && (
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
              )}
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
              ? 'Há alterações ainda não incluídas no calendário. Corrija as pendências da semana letiva ou conclua os formulários abertos.'
              : 'Há alterações ainda não incluídas no calendário. Conclua o formulário ou descarte as alterações.'}
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
      <BaseChangesNotice />
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
        <EditorSteps
          calendarId={record.id}
          current={currentSection}
          // Courses are a content issue too: the backend refuses the submission without them.
          issueCount={openIssues.length + (record.courses ? 0 : 1)}
          stepCounts={stepCounts}
        />
        <div className="editor-section-content">
          <div className="editor-section-heading">
            <h2 id="editor-section-title" ref={heading} tabIndex={-1}>
              {activeStep && (
                <>
                  <span className="visually-hidden">Etapa </span>
                  <span className="editor-title-step">{stepIndex + 1}</span>
                  <span className="visually-hidden"> de {editorSteps.length}: </span>
                </>
              )}
              {current.title}
            </h2>
            <div className="editor-section-actions" ref={setSectionActions}>
              {currentSection === 'events' && <NewEventButton />}
            </div>
          </div>
          <SectionActionsProvider value={sectionActions}>
            <Suspense fallback={<LoadingIndicator layout="overlay" label="Carregando seção…" />}>
              <Outlet key={formEpoch} />
            </Suspense>
          </SectionActionsProvider>
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
            ) : currentSection === 'issues' ? (
              <div className="editor-footer-conclusion">
                <Link
                  className="editor-action secondary"
                  to={editorPages.calendar.path}
                  params={{ calendarId: record.id }}
                  search={(previous) => previous}
                >
                  <Eye aria-hidden="true" /> Visualizar calendário
                </Link>
                {permissions.editCalendars ? (
                  <LifecycleActions
                    className="editor-footer-lifecycle"
                    placement="footer"
                    {...lifecycle}
                  />
                ) : null}
              </div>
            ) : currentSection === 'calendar' ? (
              <Link
                className="editor-action secondary"
                to={editorPages.issues.path}
                params={{ calendarId: record.id }}
                search={(previous) => previous}
              >
                <ArrowLeft aria-hidden="true" /> Voltar à revisão
              </Link>
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
          <IdentityPanelProvider>
            <EditorErrorBoundary>
              <EditorFrame />
            </EditorErrorBoundary>
          </IdentityPanelProvider>
        </EventEditorProvider>
      </CalendarExportProvider>
    </CalendarEditorProvider>
  );
}
