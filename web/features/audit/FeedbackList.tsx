import { useState } from 'react';
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { CircleDashed } from 'lucide-react';
import { daysUntilRemoval, feedbackRatings, feedbackRetentionLabel } from '#src/shared/feedback.ts';
import { Button } from '../../components/ui/Button.tsx';
import { LoadingIndicator } from '../../components/ui/LoadingIndicator.tsx';
import { roleLabels } from '../../shared/role-labels.ts';
import { functions } from '../../shared/convex/client.ts';
import { useNow } from '../../shared/useNow.ts';
import { ratingFaces } from '../feedback/faces.ts';
import './feedback-list.css';

type FeedbackEntry = FunctionReturnType<typeof functions.feedback.listFeedback>['entries'][number];
type Role = FeedbackEntry['role'];
type Context = FeedbackEntry['context'];
/** A rating from 1 to 5, or `none` for a comment without one. */
type RatingFilter = number | 'none';

const shown = 100;
/** In the last week, the time left stands out: copy what matters before it goes. */
const closeToRemoval = 7;

const contexts: Record<Context, string> = {
  submit: 'Após enviar calendário',
  review: 'Após concluir ou devolver parecer',
  spontaneous: 'Sugestão espontânea',
};

/** Hard, middle and easy read apart at a glance; the label carries the meaning too. */
function ratingTone(rating: number | null) {
  if (rating === null) return 'none';
  return rating <= 2 ? 'hard' : rating === 3 ? 'middle' : 'easy';
}

const formatDate = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

function removalLabel(days: number) {
  if (days === 0) return 'Expira hoje';
  return days === 1 ? 'Expira amanhã' : `Expira em ${days} dias`;
}

const answers = (count: number) => `${count} ${count === 1 ? 'resposta' : 'respostas'}`;
const ratingOf = (entry: FeedbackEntry): RatingFilter => entry.rating ?? 'none';

/**
 * Answered feedback for the administration: a summary by rating that also filters, the origin
 * and profile filters, and one card per answer with the comment in front.
 */
export default function FeedbackList() {
  const now = useNow(60 * 60_000);
  const feedback = useQuery(functions.feedback.listFeedback, {
    paginationOpts: { cursor: null, numItems: shown },
  });
  const [rating, setRating] = useState<RatingFilter | null>(null);
  const [context, setContext] = useState<Context | ''>('');
  const [role, setRole] = useState<Role | ''>('');
  const [commented, setCommented] = useState(false);

  const entries = feedback?.entries ?? [];
  const visible = entries.filter(
    (entry) =>
      (rating === null || ratingOf(entry) === rating) &&
      (!context || entry.context === context) &&
      (!role || entry.role === role) &&
      (!commented || entry.comment !== null),
  );
  const narrowed = rating !== null || context !== '' || role !== '' || commented;
  const summary: { value: RatingFilter; label: string; count: number }[] = [
    ...feedbackRatings.map((label, index) => ({
      value: index + 1,
      label,
      count: entries.filter((entry) => entry.rating === index + 1).length,
    })),
    {
      value: 'none',
      label: 'Sem nota',
      count: entries.filter((entry) => entry.rating === null).length,
    },
  ];

  function clear() {
    setRating(null);
    setContext('');
    setRole('');
    setCommented(false);
  }

  return (
    <div className="feedback-list">
      <p className="help">
        Respostas aos convites e sugestões enviadas pelo botão Sugestões, das mais recentes às mais
        antigas (até {shown}). Os registros são apagados {feedbackRetentionLabel} depois de
        recebidos: copie o que quiser guardar.
      </p>
      {!feedback ? <LoadingIndicator label="Carregando feedback…" /> : null}
      {feedback && !entries.length ? (
        <p className="feedback-list__empty">Nenhum feedback recebido ainda.</p>
      ) : null}
      {entries.length ? (
        <>
          <div className="feedback-summary" role="group" aria-label="Filtrar por nota">
            {summary.map((item) => {
              const Face = typeof item.value === 'number' ? ratingFaces[item.value - 1]! : null;
              return (
                <button
                  key={item.value}
                  type="button"
                  className="feedback-summary__item"
                  data-tone={ratingTone(item.value === 'none' ? null : item.value)}
                  aria-pressed={rating === item.value}
                  disabled={!item.count && rating !== item.value}
                  onClick={() => setRating(rating === item.value ? null : item.value)}
                >
                  {Face ? (
                    <Face aria-hidden="true" size={20} />
                  ) : (
                    <CircleDashed aria-hidden="true" size={20} />
                  )}
                  <span>{item.label}</span>
                  <strong className="feedback-summary__count">{item.count}</strong>
                </button>
              );
            })}
          </div>
          <div className="feedback-filters">
            <label>
              Origem
              <select
                value={context}
                onChange={(event) => setContext(event.target.value as Context | '')}
              >
                <option value="">Todas</option>
                {(Object.keys(contexts) as Context[]).map((value) => (
                  <option key={value} value={value}>
                    {contexts[value]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Perfil
              <select value={role} onChange={(event) => setRole(event.target.value as Role | '')}>
                <option value="">Todos</option>
                {(Object.keys(roleLabels) as Role[]).map((value) => (
                  <option key={value} value={value}>
                    {roleLabels[value]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={commented}
                onChange={(event) => setCommented(event.target.checked)}
              />
              Só com comentário
            </label>
          </div>
          <p className="result-status feedback-list__status" role="status">
            {narrowed ? `${visible.length} de ${answers(entries.length)}` : answers(entries.length)}
          </p>
          {visible.length ? (
            <ul className="feedback-cards" aria-label="Feedback recebido">
              {visible.map((entry) => {
                const days = daysUntilRemoval(entry.at, now);
                const Face = entry.rating === null ? null : ratingFaces[entry.rating - 1]!;
                return (
                  <li key={entry.id} className="feedback-card">
                    <div className="feedback-card__rating" data-tone={ratingTone(entry.rating)}>
                      {Face ? (
                        <Face aria-hidden="true" size={28} />
                      ) : (
                        <CircleDashed aria-hidden="true" size={28} />
                      )}
                      <span>
                        {entry.rating === null ? 'Sem nota' : feedbackRatings[entry.rating - 1]}
                      </span>
                    </div>
                    <div className="feedback-card__body">
                      {entry.comment ? (
                        <p className="feedback-card__comment">{entry.comment}</p>
                      ) : (
                        <p className="feedback-card__comment feedback-card__comment--none">
                          Sem comentário
                        </p>
                      )}
                      <p className="feedback-card__who">
                        <strong>{entry.actor}</strong> · {roleLabels[entry.role]}
                      </p>
                      <p className="feedback-card__where">
                        {contexts[entry.context]}
                        {entry.calendar ? ` · ${entry.calendar}` : ''} · {entry.route}
                      </p>
                      <p className="feedback-card__when">
                        <time dateTime={new Date(entry.at).toISOString()}>
                          {formatDate.format(new Date(entry.at))}
                        </time>
                        <span
                          className="feedback-card__removal"
                          data-close={days < closeToRemoval || undefined}
                        >
                          {removalLabel(days)}
                        </span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="feedback-list__no-match">
              <p>Nenhum feedback corresponde aos filtros.</p>
              <Button type="button" variant="secondary" onClick={clear}>
                Limpar filtros
              </Button>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
