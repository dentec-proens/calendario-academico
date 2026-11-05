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

function useSubmissions(calendarId: string) {
  return useQuery(functions.calendars.calendarSubmissions, {
    id: calendarId as Id<'calendars'>,
    paginationOpts: { numItems: 100, cursor: null },
  });
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
        documentSnapshot: dated.documentSnapshot,
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
  return (
    <section
      className="submission-comparison panel"
      id="return-comparison"
      aria-labelledby="return-comparison-title"
      data-calendar={calendarId}
      data-base={returnedSubmissionId}
    >
      <h3 id="return-comparison-title">O que mudou desde a devolução do envio {sequence}</h3>
      {diff ? <DiffView diff={diff} /> : <p className="help">Carregando a comparação…</p>}
    </section>
  );
}

/**
 * The reviewer's panel: the changes since a returned submission (or since the published calendar
 * this new version replaces), a selector for another pair in the chain and the submission history.
 */
export default function SubmissionComparison({ calendarId }: { calendarId: string }) {
  const listing = useSubmissions(calendarId);
  const [choice, setChoice] = useState<{ base?: string; target?: string }>({});
  const page = listing?.page ?? [];
  const latest = page[0];
  const target = choice.target ?? latest?.id;
  // A returned calendar's default base is the returned submission itself, which is the latest:
  // the reviewer then compares it with the round it answered.
  const base =
    choice.base ??
    listing?.defaultBases.find((id) => id !== target) ??
    page.find((submission) => submission.id === target)?.previousSubmissionId;
  const baseSide = useSubmissionSide(calendarId, base);
  const targetSide = useSubmissionSide(calendarId, target);
  const diff = useMemo(
    () =>
      baseSide && targetSide && base !== target
        ? compareContents(baseSide.side, targetSide.side)
        : null,
    [base, baseSide, target, targetSide],
  );
  if (!listing) return <p className="help">Carregando os envios…</p>;
  if (!latest) return null;
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
  return (
    <section
      className="submission-comparison panel"
      id="submission-comparison"
      aria-labelledby="submission-comparison-title"
    >
      <h3 id="submission-comparison-title">
        {baseSubmission
          ? `Alterações desde o envio ${baseSubmission.sequence}`
          : base
            ? 'Alterações desde o calendário publicado'
            : 'Primeiro envio'}
      </h3>
      {baseNote?.note ? (
        <Notice tone="warning" title={`Nota da devolução do envio ${baseSubmission!.sequence}`}>
          <p className="return-note-text">{baseNote.note}</p>
        </Notice>
      ) : null}
      <div className="diff-pair">
        <label>
          Comparar de
          <select
            id="diff-base"
            value={base ?? ''}
            onChange={(event) => setChoice({ ...choice, base: event.target.value || undefined })}
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
      {base === target ? (
        <p className="help">Escolha dois envios diferentes para comparar.</p>
      ) : !base ? (
        <p className="help">
          Primeiro envio deste calendário, sem envio anterior nem calendário publicado para
          comparar.
        </p>
      ) : diff ? (
        <DiffView diff={diff} />
      ) : (
        <p className="help">Carregando a comparação…</p>
      )}
      {!listing.isDone ? (
        <p className="help">
          Mostrando os 100 envios mais recentes. Os anteriores continuam registrados.
        </p>
      ) : null}
      <SubmissionHistory calendarId={calendarId} submissions={page} current={targetSequence} />
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
  const counts = Object.entries(
    review.entries.reduce<Record<string, number>>((total, entry) => {
      total[entry.status] = (total[entry.status] ?? 0) + 1;
      return total;
    }, {}),
  );
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
}: {
  calendarId: string;
  submissions: Submission[];
  current?: number;
}) {
  return (
    <details className="submission-history" id="submission-history">
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
      <FieldSection title="Férias docentes" fields={diff.vacations} />
      {diff.baseChanges ? (
        <section>
          <h4>Base institucional</h4>
          <FieldSection title="Referências" fields={diff.base.fields} />
          <Items title="Eventos institucionais" items={diff.base.events} />
          <Items title="Documentos" items={diff.base.documents} />
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
