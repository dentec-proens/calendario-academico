import { useMemo, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { diagnoseCalendar, diagnoseTeachingDays } from '#src/domain/calendar/diagnostics.ts';
import {
  contentAssessment,
  type ContentIssue,
  type ContentIssueGroup,
} from '#src/domain/calendar/readiness.ts';
import {
  groupPendencies,
  pendencyGroupOrder,
  type Pendency,
} from '#src/domain/calendar/pendencies.ts';
import { labelFor, offerIds } from '#src/domain/calendar/offers.ts';
import { rulesetVersion } from '#src/domain/policies/registry.ts';
import { isAssessmentStage } from '#src/domain/calendar/activities/activity-ref.ts';
import { missingCoursesIssue } from '#src/domain/calendar/identity.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useIdentityPanel } from '../identity/CalendarIdentity.tsx';
import ScopeForm from '../forms/ScopeForm.tsx';
import OfferBadges from '../OfferBadges.tsx';
import { focusPendingScope, issueDestination } from '../editor-steps.ts';
import { Notice } from '../../../components/ui/Notice.tsx';

const groupTitles: Record<ContentIssueGroup, string> = {
  structure: 'Estrutura do calendário',
  activities: 'Atividades',
  dates: 'Datas a conferir',
  'teaching-days': 'Dias letivos',
};

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

const identityKey = 'identity';

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** One item, as a compact row that leads to where it is resolved. */
function IssueRow({
  issue,
  tone,
  showOffer,
}: {
  issue: Pendency;
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
        {showOffer && (
          <OfferBadges offers={issue.offerIds.map((offerId) => labelFor(state, offerId))} />
        )}
        <span className="review-row-detail">
          {issue.details.map((detail) => (
            <span key={detail.text}>
              {/* The badges say whom the row concerns; a sentence for only some of them says so. */}
              {showOffer && detail.offerIds.length < issue.offerIds.length && (
                <span className="review-row-detail-offers">
                  {detail.offerIds.map((offerId) => labelFor(state, offerId)).join(', ')}:{' '}
                </span>
              )}
              {detail.text}
            </span>
          ))}
        </span>
      </span>
    </>
  );
  const chevron = <ChevronRight className="activity-row-chevron" aria-hidden="true" />;
  const target = issue.target;
  if (issue.key === identityKey)
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
      <button type="button" className="review-row" onClick={focusPendingScope}>
        {body}
        {chevron}
      </button>
    );
  const destination = issueDestination(issue);
  if (!destination) return <div className="review-row">{body}</div>;
  return (
    <Link
      className="review-row"
      to={destination.to}
      params={{ calendarId: record.id }}
      search={(previous: Record<string, unknown>) => ({ ...previous, ...destination.search })}
      hashScrollIntoView={false}
    >
      {body}
      {chevron}
    </Link>
  );
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
  const identity: ContentIssue = {
    code: identityKey,
    message: missingCoursesIssue,
    group: 'structure',
    title: 'Identificação',
    detail: missingCoursesIssue,
  };
  const issues = groupPendencies(
    // The backend refuses the submission without courses.
    record.courses ? assessment.issues : [identity, ...assessment.issues],
    state,
  );
  const notes = groupPendencies(assessment.notes, state);
  const showOffer = state.offers.length > 1;
  // What only the institutional review resolves, after the submission (saved state only).
  const contentMessages = new Set(assessment.issues.map((issue) => issue.message));
  const validation = dirty
    ? []
    : record.readiness.issues.filter((issue) => !contentMessages.has(issue));
  const plan = useMemo(() => diagnoseCalendar(state).plan.rows, [state]);
  const groups = pendencyGroupOrder
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
            ? `${groups.map(({ group, items }) => `${items.length} em ${groupTitles[group].toLowerCase()}`).join(' · ')}. ${showOffer ? 'Cada atividade conta uma vez, mesmo que falte em várias ofertas; estrutura e dias letivos contam por item. ' : ''}As férias exigidas precisam estar corretas antes do envio; as demais pendências são listadas na confirmação do envio.`
            : 'O calendário pode ser enviado para análise. A revisão da DENTEC/PROENS acontece depois do envio.'}
        </p>
      </Notice>
      <ScopeForm />
      <section className="review-section" aria-labelledby="review-progress-title">
        <h3 id="review-progress-title" className="review-heading">
          Progresso por oferta
        </h3>
        {showOffer && (
          <p className="help">
            Cada oferta conta as suas atividades obrigatórias, por isso estes números não somam às
            pendências acima.
          </p>
        )}
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
                <li key={issue.key} className="issue-item" data-issue={issue.key}>
                  <IssueRow issue={issue} tone="pending" showOffer={showOffer} />
                </li>
              ))}
            </ul>
          </ReviewGroup>
        ))}
      </div>
      {notes.length > 0 && (
        <ReviewGroup id="review-warnings" title="Avisos sem bloqueio" count={notes.length}>
          <ul className="review-rows">
            {notes.map((note) => (
              <li key={note.key} className="issue-item" data-warning={note.key}>
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
