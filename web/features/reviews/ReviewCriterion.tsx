import { useState } from 'react';
import type { reviews } from '../../shared/convex/reviews.ts';
import { ChoiceGroup } from '../../components/ui/ChoiceGroup.tsx';
import { TextAreaField } from '../../components/ui/Field.tsx';
import { StatusBadge } from '../../components/ui/Feedback.tsx';
import ReviewEvidence, { type Criterion } from './ReviewEvidence.tsx';

type Entry = Parameters<typeof reviews.save>[1]['entries'][number];

const assessmentOptions = [
  { value: 'PENDENTE', label: 'A avaliar' },
  { value: 'ATENDIDO', label: 'Atendido' },
  { value: 'NAO_ATENDIDO', label: 'Não atendido' },
  { value: 'NAO_APLICAVEL', label: 'Não aplicável' },
] as const;

const suggestionLabels: Record<NonNullable<Criterion['suggestion']>, string> = {
  ATENDIDO: 'atendido',
  NAO_ATENDIDO: 'não atendido',
  NAO_APLICAVEL: 'não aplicável',
};

export default function ReviewCriterion({
  calendarYear,
  criterion,
  number,
  entry,
  changed,
  busy,
  hidden,
  onChange,
}: {
  calendarYear: number;
  criterion: Criterion;
  number: number;
  entry: Entry;
  changed: boolean;
  busy: boolean;
  /** Left out by the filter, keeping what the reviewer opened in it. */
  hidden: boolean;
  onChange: <K extends 'status' | 'notes'>(field: K, value: Entry[K]) => void;
}) {
  const [notesOpen, setNotesOpen] = useState(entry.status === 'NAO_ATENDIDO');
  // Whoever marks it, a criterion not attended asks for what the campus must adjust.
  const [seenStatus, setSeenStatus] = useState(entry.status);
  if (seenStatus !== entry.status) {
    setSeenStatus(entry.status);
    if (entry.status === 'NAO_ATENDIDO') setNotesOpen(true);
  }
  const pending = entry.status === 'PENDENTE';
  // Only a suggestion saved before choosing became the assessment, in a parecer now closed.
  const proposal = !pending && !entry.reviewed;
  const situation = proposal
    ? 'Proposta automática, não confirmada'
    : pending
      ? changed
        ? 'A avaliar · por salvar'
        : 'A avaliar'
      : changed
        ? 'Por salvar'
        : 'Salvo';
  const suggestionId = `criterion-suggestion-${criterion.id}`;

  return (
    <li className="review-item" aria-labelledby={`criterion-title-${criterion.id}`} hidden={hidden}>
      <span className="review-item__number" aria-hidden="true">
        {String(number).padStart(2, '0')}
      </span>
      <div className="review-item__content">
        <div className="review-item__heading">
          <h3 id={`criterion-title-${criterion.id}`}>{criterion.title}</h3>
          <StatusBadge
            tone={changed ? 'warning' : !pending && !proposal ? 'success' : 'neutral'}
            data-origin={criterion.id}
          >
            {situation}
          </StatusBadge>
        </div>
        <div className="review-item__comparison">
          <section className="review-item__rule" data-rule={criterion.id}>
            <h4>A regra exige</h4>
            {criterion.requirement ? <p>{criterion.requirement}</p> : null}
            <p className="review-item__source">{criterion.source}</p>
          </section>
          <section className="review-item__registered" data-registered={criterion.id}>
            <h4>Registrado no calendário</h4>
            <ReviewEvidence criterion={criterion} calendarYear={calendarYear} />
          </section>
        </div>
        {criterion.toCheck.length ? (
          <div className="review-item__check" data-check={criterion.id}>
            <h4>Confira</h4>
            <ul>
              {criterion.toCheck.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <div className="review-item__evaluation" data-fields={criterion.id}>
        <ChoiceGroup
          label={`Avaliação: ${criterion.title}`}
          value={entry.status}
          options={assessmentOptions}
          disabled={busy}
          {...(criterion.suggestion ? { 'aria-describedby': suggestionId } : {})}
          onValueChange={(value) => onChange('status', value)}
        />
        {criterion.suggestion ? (
          <p id={suggestionId} className="review-item__suggestion" data-suggestion={criterion.id}>
            Sugestão do sistema: {suggestionLabels[criterion.suggestion]}
          </p>
        ) : null}
      </div>
      <details
        className="review-item__notes"
        open={notesOpen}
        onToggle={(event) => setNotesOpen(event.currentTarget.open)}
      >
        <summary>
          Observações <span>{entry.notes.trim() ? '· observação registrada' : '(opcional)'}</span>
        </summary>
        <TextAreaField
          label="Observações (opcional)"
          data-notes={criterion.id}
          disabled={busy}
          maxLength={2000}
          rows={2}
          placeholder="Registre a evidência, o ajuste ou a orientação ao campus."
          value={entry.notes}
          onValueChange={(value) => onChange('notes', value)}
        />
      </details>
    </li>
  );
}
