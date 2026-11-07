import { assessmentCounts } from '#src/domain/reviews/criteria.ts';
import { useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import {
  compareContents,
  describeValue,
  type CalendarDiff,
  type DiffSide,
  type FieldChange,
  type ItemChange,
} from '#src/domain/calendar/diff.ts';
import type { Id } from '../../../convex/_generated/dataModel.js';
import { Notice } from '../../components/ui/Notice.tsx';
import { functions } from '../../shared/convex/client.ts';
import { submissionDates } from '../../shared/convex/calendar-dates.ts';
import './lifecycle.css';

type Listing = NonNullable<ReturnType<typeof useSubmissions>>;
type Submission = Listing['page'][number];

const decisionLabels: Record<string, string> = {
  withdrawn: 'Recolhido',
  returned: 'Devolvido',
  concluded: 'Revisão concluída',
  reopened: 'Revisão reaberta',
  published: 'Publicado',
};

function useSubmissions(calendarId: string, enabled = true) {
  return useQuery(
    functions.calendars.calendarSubmissions,
    enabled
      ? {
          id: calendarId as Id<'calendars'>,
          paginationOpts: { numItems: 100, cursor: null },
        }
      : 'skip',
  );
}

/** A submission copy never changes, so its subscription stays quiet during autosave. */
function useSubmissionSide(calendarId: string, submissionId: string | undefined) {
  const copy = useQuery(
    functions.calendars.submissionContent,
    submissionId
      ? {
          id: calendarId as Id<'calendars'>,
          submissionId: submissionId as Id<'calendarSubmissions'>,
        }
      : 'skip',
  );
  return useMemo(() => {
    if (!copy) return copy;
    const dated = submissionDates(copy);
    return {
      copy: dated,
      side: {
        state: dated.state,
        institutionalSnapshot: dated.institutionalSnapshot,
        catalogueRevision: dated.catalogueRevision,
      } as DiffSide,
    };
  }, [copy]);
}

const outcome = (submission: Submission) => submission.decisions.at(-1)?.action;

/** One line for the resubmission dialog. */
export function diffSummary(diff: CalendarDiff | null | undefined) {
  if (!diff) return '';
  if (diff.unchanged) return 'Nenhuma alteração desde a devolução.';
  return `Desde a devolução: ${diff.campusChanges} alteração(ões) do campus${diff.baseChanges ? ` e ${diff.baseChanges} da base institucional` : ''}.`;
}

/**
 * Compares the current content of a returned calendar with the returned submission: what the
 * campus changed since the return. The diff is computed here, never by a reactive query.
 */
export function useReturnComparison(
  calendarId: string,
  returnedSubmissionId: string | undefined,
  current: DiffSide | null,
) {
  const base = useSubmissionSide(calendarId, returnedSubmissionId);
  return useMemo(
    () => (base && current ? compareContents(base.side, current) : null),
    [base, current],
  );
}

export function ReturnComparison({
  calendarId,
  returnedSubmissionId,
  sequence,
  diff,
}: {
  calendarId: string;
  returnedSubmissionId: string;
  sequence: number;
  diff: CalendarDiff | null;
}) {
  // This note shows above every step: the note stays in view and the comparison on request.
  if (diff?.unchanged)
    return (
      <p className="help" id="return-comparison" data-unchanged>
        Nenhuma alteração desde a devolução do envio {sequence}.
      </p>
    );
  return (
    <details
      className="submission-comparison panel"
      id="return-comparison"
      data-calendar={calendarId}
      data-base={returnedSubmissionId}
    >
      <summary id="return-comparison-title">
        O que mudou desde a devolução do envio {sequence}
      </summary>
      {diff ? <DiffView diff={diff} /> : <p className="help">Carregando a comparação…</p>}
    </details>
  );
}

/**
 * The pair of submissions the reviewer compares: by default the changes since a returned
 * submission, or since the published calendar this new version would replace.
 */
export function useSubmissionComparison(calendarId: string, enabled = true) {
  const listing = useSubmissions(calendarId, enabled);
  // A base of null is the reviewer's choice not to compare; undefined follows the default.
  const [choice, setChoice] = useState<{ base?: string | null; target?: string }>({});
  const page = listing?.page ?? [];
  const latest = page[0];
  const target = choice.target ?? latest?.id;
  // A returned calendar's default base is the returned submission itself, which is the latest:
  // the reviewer then compares it with the round it answered.
  const defaultBase =
    listing?.defaultBases.find((id) => id !== target) ??
    page.find((submission) => submission.id === target)?.previousSubmissionId;
  const base = choice.base === undefined ? defaultBase : (choice.base ?? undefined);
  const baseSide = useSubmissionSide(calendarId, base);
  // Without a base nothing is compared, so a first submission does not load its copy.
  const targetSide = useSubmissionSide(calendarId, base ? target : undefined);
  const diff = useMemo(
    () =>
      baseSide && targetSide && base !== target
        ? compareContents(baseSide.side, targetSide.side)
        : null,
    [base, baseSide, target, targetSide],
  );
  return { listing, page, target, base, hasDefaultBase: !!defaultBase, diff, choice, setChoice };
}

export type SubmissionComparisonState = ReturnType<typeof useSubmissionComparison>;

/** One line about the pair compared, for where the details are a click away. */
export function comparisonHeadline({
  listing,
  page,
  target,
  base,
  hasDefaultBase,
  diff,
}: SubmissionComparisonState) {
  if (!listing) return { value: 'Carregando…' };
  if (!base || base === target)
    return { value: hasDefaultBase || base ? 'Sem comparação' : 'Primeiro envio' };
  const sequence = page.find((submission) => submission.id === base)?.sequence;
  const detail = sequence ? `desde o envio ${sequence}` : 'desde o calendário publicado';
  if (!diff) return { value: 'Carregando…', detail };
  const changes = diff.campusChanges + diff.baseChanges;
  return {
    value: !changes
      ? 'Nenhuma alteração'
      : `${changes} ${changes === 1 ? 'alteração' : 'alterações'}`,
    detail,
  };
}

/** The reviewer's panel: what changed in the pair, the choice of another pair and the history. */
export default function SubmissionComparison({
  calendarId,
  comparison,
}: {
  calendarId: string;
  comparison: SubmissionComparisonState;
}) {
  const { listing, page, target, base, hasDefaultBase, diff, choice, setChoice } = comparison;
  if (!listing) return <p className="help">Carregando os envios…</p>;
  if (!page.length) return null;
  const options = [
    ...page.map((submission) => ({
      id: submission.id,
      label: `Envio ${submission.sequence} · ${new Date(submission.submittedAt).toLocaleDateString('pt-BR')}${outcome(submission) ? ` · ${decisionLabels[outcome(submission)!]}` : ''}`,
      withdrawn: outcome(submission) === 'withdrawn',
    })),
    ...listing.related.map((item) => ({
      id: item.submissionId,
      label: `Publicado · ${item.name}`,
      withdrawn: false,
    })),
  ];
  const baseSubmission = page.find((submission) => submission.id === base);
  const baseNote = baseSubmission?.decisions.findLast((decision) => decision.action === 'returned');
  const targetSequence = page.find((submission) => submission.id === target)?.sequence;
  const firstSubmission = !base && !hasDefaultBase;
  return (
    <section
      className="submission-comparison review-comparison"
      id="submission-comparison"
      aria-labelledby="submission-comparison-title"
    >
      <h3 id="submission-comparison-title">
        {baseSubmission
          ? `Alterações desde o envio ${baseSubmission.sequence}`
          : base
            ? 'Alterações desde o calendário publicado'
            : firstSubmission
              ? 'Primeiro envio'
              : 'Sem comparação'}
      </h3>
      {baseNote?.note ? (
        <Notice tone="warning" title={`Nota da devolução do envio ${baseSubmission!.sequence}`}>
          <p className="return-note-text">{baseNote.note}</p>
        </Notice>
      ) : null}
      {base === target ? (
        <p className="help">Escolha dois envios diferentes para comparar.</p>
      ) : firstSubmission ? (
        <p className="help">
          Primeiro envio deste calendário, sem envio anterior nem calendário publicado para
          comparar.
        </p>
      ) : !base ? (
        <p className="help">Escolha um envio para comparar.</p>
      ) : diff ? (
        <DiffView diff={diff} />
      ) : (
        <p className="help">Carregando a comparação…</p>
      )}
      {options.length > 1 ? (
        <details className="submission-pair">
          <summary>Comparar outros envios</summary>
          <div className="diff-pair">
            <label>
              Comparar de
              <select
                id="diff-base"
                value={base ?? ''}
                onChange={(event) => setChoice({ ...choice, base: event.target.value || null })}
              >
                <option value="">Sem comparação</option>
                {options
                  .filter((option) => !option.withdrawn && option.id !== target)
                  .map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Até
              <select
                id="diff-target"
                value={target}
                onChange={(event) => setChoice({ ...choice, target: event.target.value })}
              >
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </details>
      ) : null}
      {!listing.isDone ? (
        <p className="help">
          Mostrando os 100 envios mais recentes. Os anteriores continuam registrados.
        </p>
      ) : null}
      <SubmissionHistory
        calendarId={calendarId}
        submissions={page}
        current={targetSequence}
        open={firstSubmission}
      />
    </section>
  );
}

const reviewStatusLabels: Record<string, string> = {
  PENDENTE: 'Pendente',
  ATENDIDO: 'Atendido',
  NAO_ATENDIDO: 'Não atendido',
  NAO_APLICAVEL: 'Não aplicável',
};

/** The review a decision recorded, loaded only when opened. */
function DecisionReview({
  calendarId,
  submissionId,
  revision,
}: {
  calendarId: string;
  submissionId: string;
  revision: number;
}) {
  const review = useQuery(functions.reviews.submissionReview, {
    id: calendarId as Id<'calendars'>,
    submissionId: submissionId as Id<'calendarSubmissions'>,
    revision,
  });
  if (!review) return <p className="help">Carregando o parecer…</p>;
  const counts = Object.entries(assessmentCounts(review.entries));
  return (
    <div className="decision-review">
      <p>
        {review.reviewer.name} · {new Date(review.updatedAt).toLocaleString('pt-BR')} ·{' '}
        {counts
          .map(([status, count]) => `${count} ${reviewStatusLabels[status] ?? status}`)
          .join(', ')}
      </p>
      <p className="return-note-text">{review.conclusion}</p>
    </div>
  );
}

function DecisionReviewToggle(props: {
  calendarId: string;
  submissionId: string;
  revision: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary data-decision-review={props.revision}>Ver parecer (rev. {props.revision})</summary>
      {open ? <DecisionReview {...props} /> : null}
    </details>
  );
}

function SubmissionHistory({
  calendarId,
  submissions,
  current,
  open,
}: {
  calendarId: string;
  submissions: Submission[];
  current?: number;
  /** Starts open when the history is all there is to show. */
  open: boolean;
}) {
  return (
    <details className="submission-history" id="submission-history" open={open}>
      <summary>Histórico de envios</summary>
      <ol reversed>
        {submissions.map((submission) => (
          <li key={submission.id} aria-current={submission.sequence === current || undefined}>
            <strong>Envio {submission.sequence}</strong> ·{' '}
            {new Date(submission.submittedAt).toLocaleString('pt-BR')} · {submission.submittedBy}
            <ul>
              {submission.decisions.map((decision, index) => (
                <li key={index}>
                  {decisionLabels[decision.action]} ·{' '}
                  {new Date(decision.at).toLocaleString('pt-BR')}
                  {decision.by ? ` · ${decision.by.name}` : ''}
                  {decision.note ? <p className="return-note-text">{decision.note}</p> : null}
                  {decision.reviewRevision !== undefined ? (
                    <DecisionReviewToggle
                      calendarId={calendarId}
                      submissionId={submission.id}
                      revision={decision.reviewRevision}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </details>
  );
}

const sectionTitles = {
  offers: 'Ofertas',
  periods: 'Períodos letivos',
  events: 'Eventos do campus',
} as const;
const kindLabels: Record<ItemChange['kind'], string> = {
  added: 'Incluído',
  removed: 'Removido',
  changed: 'Alterado',
  reidentified: 'Alterado (identificador novo)',
};

function Fields({ fields }: { fields: FieldChange[] }) {
  if (!fields.length) return null;
  return (
    <ul className="diff-fields">
      {fields.map((field) => (
        <li key={field.field}>
          {field.label}: {field.text?.before ?? describeValue(field.field, field.before)} →{' '}
          {field.text?.after ?? describeValue(field.field, field.after)}
        </li>
      ))}
    </ul>
  );
}

function Items({ title, items }: { title: string; items: ItemChange[] }) {
  if (!items.length) return null;
  return (
    <section>
      <h4>{title}</h4>
      <ul className="diff-list">
        {items.map((item) => (
          <li key={`${item.kind}:${item.id}`} data-kind={item.kind}>
            <strong>{kindLabels[item.kind]}:</strong> {item.name}
            <Fields fields={item.fields} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function FieldSection({ title, fields }: { title: string; fields: FieldChange[] }) {
  if (!fields.length) return null;
  return (
    <section>
      <h4>{title}</h4>
      <ul className="diff-list">
        {fields.map((field) => (
          <li key={field.field} data-kind="changed">
            {field.label}: {field.text?.before ?? describeValue(field.field, field.before)} →{' '}
            {field.text?.after ?? describeValue(field.field, field.after)}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DiffView({ diff }: { diff: CalendarDiff }) {
  const { effect } = diff;
  const reidentified = [...diff.periods, ...diff.events].some(
    (item) => item.kind === 'reidentified',
  );
  return (
    <div className="diff-view" data-unchanged={diff.unchanged || undefined}>
      {diff.unchanged ? <p>Nenhuma diferença entre os dois conteúdos.</p> : null}
      <Items title={sectionTitles.offers} items={diff.offers} />
      <FieldSection title="Semana letiva" fields={diff.week} />
      <Items title={sectionTitles.periods} items={diff.periods} />
      <Items title={sectionTitles.events} items={diff.events} />
      <FieldSection title="Observâncias" fields={diff.observances} />
      <Items title="Férias escolares" items={diff.vacations.school} />
      <Items title="Férias docentes" items={diff.vacations.teacher} />
      <FieldSection title="Férias docentes" fields={diff.vacations.total} />
      {diff.baseChanges ? (
        <section>
          <h4>Base institucional</h4>
          <FieldSection title="Referências" fields={diff.base.fields} />
          <Items title="Eventos institucionais" items={diff.base.events} />
        </section>
      ) : null}
      {reidentified ? (
        <p className="help">
          Itens com identificador novo foram associados pela atividade e pelas ofertas. Fora disso,
          a correspondência individual não é garantida.
        </p>
      ) : null}
      <section>
        <h4>Efeito da mudança</h4>
        <p className="help">
          Avaliado pelas regras atuais nos dois lados. O efeito ajuda a análise, mas sozinho não
          comprova que a devolução foi atendida.
        </p>
        {effect.rulesetDiffers ? (
          <Notice tone="info">
            Os conjuntos de regras dos dois lados são diferentes; parte da diferença pode vir da
            mudança de regra.
          </Notice>
        ) : null}
        {effect.teachingDays.length ? (
          <table className="diff-days">
            <caption>Dias letivos por oferta e período</caption>
            <thead>
              <tr>
                <th scope="col">Oferta</th>
                <th scope="col">Período</th>
                <th scope="col">Antes</th>
                <th scope="col">Depois</th>
              </tr>
            </thead>
            <tbody>
              {effect.teachingDays.map((row) => (
                <tr key={`${row.offerId}:${row.term}`}>
                  <td>{row.label}</td>
                  <td>{row.termLabel}</td>
                  <td>{row.before ?? 'indisponível'}</td>
                  <td>{row.after ?? 'indisponível'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="help">Contagem de dias letivos indisponível nos dois lados.</p>
        )}
        {effect.issues.added.length ? (
          <>
            <p>Pendências novas:</p>
            <ul className="diff-fields">
              {effect.issues.added.map((issue) => (
                <li key={issue.code}>{issue.message}</li>
              ))}
            </ul>
          </>
        ) : null}
        {effect.issues.resolved.length ? (
          <>
            <p>Pendências resolvidas:</p>
            <ul className="diff-fields">
              {effect.issues.resolved.map((issue) => (
                <li key={issue.code}>{issue.message}</li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    </div>
  );
}
