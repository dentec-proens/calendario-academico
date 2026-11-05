import { useMemo, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { diagnoseCalendar, diagnoseTeachingDays } from '#src/domain/calendar/diagnostics.ts';
import {
  contentAssessment,
  type ContentIssue,
  type ContentIssueGroup,
} from '#src/domain/calendar/readiness.ts';
import { labelFor, offerIds } from '#src/domain/calendar/offers.ts';
import { rulesetVersion } from '#src/domain/policies/registry.ts';
import { activityKey, isAssessmentStage } from '#src/domain/calendar/activities/activity-ref.ts';
import { missingCoursesIssue } from '#src/domain/calendar/identity.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useIdentityPanel } from '../identity/CalendarIdentity.tsx';
import ScopeForm from '../forms/ScopeForm.tsx';
import { Notice } from '../../../components/ui/Notice.tsx';

const groupTitles: Record<ContentIssueGroup, string> = {
  structure: 'Estrutura do calendário',
  activities: 'Atividades',
  dates: 'Datas a conferir',
  'teaching-days': 'Dias letivos',
};
const groupOrder: ContentIssueGroup[] = ['structure', 'activities', 'dates', 'teaching-days'];

/** Checks the campus confirms by itself: they never become content issues. */
const reminders = [
  {
    title: 'Feriados municipais e decisões locais',
    detail: 'Confira se estão registrados, com as evidências e a legislação aplicável.',
  },
  {
    title: 'Carga horária e apreciação institucional',
    detail: 'A contagem de dias letivos não representa aprovação institucional.',
  },
];

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

type Row = ContentIssue & { identity?: true };

/** One issue, as a compact row that leads to where it is resolved. */
function IssueRow({
  issue,
  tone,
  showOffer,
}: {
  issue: Row;
  tone: 'pending' | 'info';
  showOffer: boolean;
}) {
  const { state, record, readOnly } = useCalendarEditor();
  const openIdentity = useIdentityPanel();
  const body = (
    <>
      <span
        className="activity-dot"
        data-status="pending"
        data-tone={tone === 'info' ? 'info' : undefined}
        aria-hidden="true"
      />
      <span className="review-row-text">
        <strong>{issue.title}</strong>
        <span className="review-row-detail">
          {showOffer && issue.offerId && (
            <span className="review-row-offer">{labelFor(state, issue.offerId)}</span>
          )}
          {issue.detail}
        </span>
      </span>
    </>
  );
  const chevron = <ChevronRight className="activity-row-chevron" aria-hidden="true" />;
  const target = issue.target;
  if (issue.identity)
    return readOnly ? (
      <div className="review-row">{body}</div>
    ) : (
      <button type="button" className="review-row" onClick={openIdentity}>
        {body}
        <span className="review-row-action">Informar cursos</span>
        {chevron}
      </button>
    );
  if (target?.area === 'scope')
    return (
      <button
        type="button"
        className="review-row"
        onClick={() => {
          const scope = document.getElementById('review-scope');
          scope?.scrollIntoView({ block: 'start' });
          scope
            ?.querySelector<HTMLElement>('[role="radio"], button')
            ?.focus({ preventScroll: true });
        }}
      >
        {body}
        {chevron}
      </button>
    );
  const link = (to: string, search: Record<string, string | undefined> = {}, label?: string) => (
    <Link
      className="review-row"
      to={to}
      params={{ calendarId: record.id }}
      search={(previous: Record<string, unknown>) => ({ ...previous, ...search })}
      hashScrollIntoView={false}
    >
      {body}
      {label && <span className="review-row-action">{label}</span>}
      {chevron}
    </Link>
  );
  if (target?.area === 'organization') return link('/calendarios/$calendarId/periodos');
  if (target?.area === 'activity') {
    const stage = isAssessmentStage(target.activity);
    // A link to an activity opens the by-activity view, whatever the URL had.
    return link(
      stage ? '/calendarios/$calendarId/periodos' : '/calendarios/$calendarId/atividades',
      { atividade: activityKey(target.activity), atividadeVisao: undefined },
    );
  }
  if (target?.area === 'date')
    return link('/calendarios/$calendarId/atividades', {
      atividadeVisao: 'data',
      atividadeBusca: target.name,
    });
  if (target?.area === 'observance')
    return link('/calendarios/$calendarId/atividades', { atividadeOrigem: 'base' });
  return <div className="review-row">{body}</div>;
}

function ReviewGroup({
  id,
  title,
  count,
  children,
}: {
  id: string;
  title: string;
  count: ReactNode;
  children: ReactNode;
}) {
  return (
    <details className="review-group" id={id} open>
      <summary>
        <span className="review-group-title">{title}</span>
        <span className="review-group-count">{count}</span>
        <ChevronDown className="review-group-chevron" aria-hidden="true" />
      </summary>
      {children}
    </details>
  );
}

export default function IssuesSection() {
  const { state, record, dirty, evaluation, baseEvents } = useCalendarEditor();
  const assessment = useMemo(
    () => contentAssessment({ state, institutionalSnapshot: baseEvents }),
    [state, baseEvents],
  );
  const issues: Row[] = [
    // The backend refuses the submission without courses.
    ...(record.courses
      ? []
      : [
          {
            code: 'identity',
            message: missingCoursesIssue,
            group: 'structure',
            title: 'Identificação',
            detail: missingCoursesIssue,
            identity: true,
          } as const,
        ]),
    ...assessment.issues,
  ];
  const showOffer = state.offers.length > 1;
  // What only the institutional review resolves, after the submission (saved state only).
  const contentMessages = new Set(assessment.issues.map((issue) => issue.message));
  const validation = dirty
    ? []
    : record.readiness.issues.filter((issue) => !contentMessages.has(issue));
  const plan = useMemo(() => diagnoseCalendar(state).plan.rows, [state]);
  const groups = groupOrder
    .map((group) => ({ group, items: issues.filter((issue) => issue.group === group) }))
    .filter(({ items }) => items.length);
  return (
    <section id="issues" className="view review-step">
      <Notice
        id="review-summary"
        tone={issues.length ? 'warning' : 'success'}
        title={
          issues.length
            ? `${plural(issues.length, 'pendência', 'pendências')} de conteúdo`
            : 'Nenhuma pendência de conteúdo'
        }
        titleAs="h3"
      >
        <p>
          {issues.length
            ? `${groups.map(({ group, items }) => `${items.length} em ${groupTitles[group].toLowerCase()}`).join(' · ')}. Você pode enviar para análise mesmo com pendências: elas são listadas na confirmação do envio.`
            : 'O calendário pode ser enviado para análise. A revisão da DENTEC/PROENS acontece depois do envio.'}
        </p>
      </Notice>
      <ScopeForm />
      <section className="review-section" aria-labelledby="review-progress-title">
        <h3 id="review-progress-title" className="review-heading">
          Progresso por oferta
        </h3>
        <ul id="review-progress" className="activity-summary review-progress">
          {offerIds(state).map((offerId) => {
            const required = plan.filter(
              (row) =>
                row.offerId === offerId &&
                row.applicability === 'required' &&
                !isAssessmentStage(row.requirement.activity),
            );
            const fulfilled = required.filter((row) => row.coverage === 'complete').length;
            const annual = evaluation
              ? diagnoseTeachingDays(state, evaluation).find(
                  (check) => check.offerId === offerId && check.scope === 'annual',
                )
              : undefined;
            return (
              <li key={offerId} data-review-offer={offerId}>
                <strong>{labelFor(state, offerId)}</strong>
                <span>
                  Atividades obrigatórias: {fulfilled} de {required.length} com planejamento
                  completo.
                </span>
                <progress
                  value={fulfilled}
                  max={Math.max(required.length, 1)}
                  aria-label={`Atividades de ${labelFor(state, offerId)}`}
                />
                <span>
                  Dias letivos:{' '}
                  {!annual
                    ? 'a contagem depende da organização e dos períodos.'
                    : annual.expected === null
                      ? `${annual.observed}, sem mínimo normativo configurado.`
                      : `${annual.observed} de ${annual.expected} mínimos no ano.`}
                </span>
                {annual?.expected ? (
                  <progress
                    value={Math.min(annual.observed, annual.expected)}
                    max={annual.expected}
                    aria-label={`Dias letivos de ${labelFor(state, offerId)}`}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
      <div id="issue-list" className="review-section">
        {groups.map(({ group, items }) => (
          <ReviewGroup
            key={group}
            id={`review-group-${group}`}
            title={groupTitles[group]}
            count={items.length}
          >
            <ul className="review-rows">
              {items.map((issue) => (
                <li key={issue.code} className="issue-item" data-issue={issue.code}>
                  <IssueRow issue={issue} tone="pending" showOffer={showOffer} />
                </li>
              ))}
            </ul>
          </ReviewGroup>
        ))}
      </div>
      {assessment.notes.length > 0 && (
        <ReviewGroup
          id="review-warnings"
          title="Avisos sem bloqueio"
          count={assessment.notes.length}
        >
          <ul className="review-rows">
            {assessment.notes.map((note) => (
              <li key={note.code} className="issue-item" data-warning={note.code}>
                <IssueRow issue={note} tone="info" showOffer={showOffer} />
              </li>
            ))}
          </ul>
        </ReviewGroup>
      )}
      {validation.length > 0 && (
        <details className="review-group" id="review-validation">
          <summary>
            <span className="review-group-title">Validação da DENTEC/PROENS</span>
            <span className="review-group-count">{validation.length}</span>
            <ChevronDown className="review-group-chevron" aria-hidden="true" />
          </summary>
          <p className="help">
            Itens resolvidos pela revisão institucional depois do envio; não dependem do campus.
          </p>
          <ul className="review-validation">
            {validation.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      )}
      <section className="review-section" aria-labelledby="review-reminders-title">
        <h3 id="review-reminders-title" className="review-heading">
          Antes de enviar, confira
        </h3>
        <ul id="review-reminders" className="review-reminders">
          {reminders.map((item) => (
            <li key={item.title}>
              <strong>{item.title}</strong>
              <span>{item.detail}</span>
            </li>
          ))}
        </ul>
      </section>
      <p className="help review-ruleset">
        Regras: {rulesetVersion(state)} · <Link to="/regras">Ver regras do calendário</Link>
      </p>
    </section>
  );
}
