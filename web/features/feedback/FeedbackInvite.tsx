import { useEffect, useId, useRef, useState } from 'react';
import { useMutation } from 'convex/react';
import { MessageSquareHeart } from 'lucide-react';
import {
  feedbackQuestions,
  feedbackRatings,
  maximumFeedbackComment,
  type InvitationContext,
} from '#src/shared/feedback.ts';
import type { Id } from '../../../convex/_generated/dataModel.js';
import { Button } from '../../components/ui/Button.tsx';
import { TextAreaField } from '../../components/ui/Field.tsx';
import { Notice } from '../../components/ui/Notice.tsx';
import { functions } from '../../shared/convex/client.ts';
import { nativeError } from '../../shared/convex/errors.ts';
import { portalRelease } from '../../shared/convex/report-error.ts';
import { ratingFaces } from './faces.ts';

export type Invitation =
  | { kind: 'invitation'; id: Id<'feedback'>; context: InvitationContext; key: string }
  | { kind: 'spontaneous'; key: string };

/**
 * An optional invitation leaves by itself when untouched (see “Tempo de exibição de avisos” in
 * docs/componentes-interface.md); the thanks, once read, too.
 */
export const untouchedTimeout = 15_000;
export const thanksTimeout = 4_000;

/**
 * One rating click is enough; the comment comes after, optional. An invitation was recorded when
 * shown, so leaving it untouched counts as ignoring it, without a message or a request.
 */
export default function FeedbackInvite({
  invitation,
  onClose,
}: {
  invitation: Invitation;
  onClose: () => void;
}) {
  const spontaneous = invitation.kind === 'spontaneous';
  const context = spontaneous ? 'spontaneous' : invitation.context;
  const titleId = useId();
  const root = useRef<HTMLDivElement>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [thanked, setThanked] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  /** Any interaction stops the timer for good: the person decided to stay. */
  const [engaged, setEngaged] = useState(spontaneous);
  /** Pointer over the invitation, or focus inside it, holds the timer. */
  const [held, setHeld] = useState(false);

  const rate = useMutation(functions.feedback.rateFeedback);
  const dismiss = useMutation(functions.feedback.dismissFeedback);
  const addComment = useMutation(functions.feedback.commentFeedback);
  const send = useMutation(functions.feedback.sendFeedback);

  useEffect(() => {
    if (thanked) {
      const timer = window.setTimeout(onClose, thanksTimeout);
      return () => window.clearTimeout(timer);
    }
    if (engaged || held) return;
    const timer = window.setTimeout(onClose, untouchedTimeout);
    return () => window.clearTimeout(timer);
  }, [thanked, engaged, held, onClose]);

  // The person opened the suggestion: focus goes to its first choice.
  useEffect(() => {
    if (spontaneous) root.current?.querySelector<HTMLElement>('.feedback-scale button')?.focus();
  }, [spontaneous]);

  async function attempt(work: () => Promise<unknown>) {
    setPending(true);
    setError('');
    try {
      await work();
      return true;
    } catch (failure) {
      setError(nativeError(failure).message);
      return false;
    } finally {
      setPending(false);
    }
  }

  function close() {
    // Closing an invitation before rating it is a refusal, recorded so it is not asked again.
    if (invitation.kind === 'invitation' && rating === null && !thanked)
      void dismiss({ id: invitation.id }).catch(() => {});
    onClose();
  }

  async function choose(value: number) {
    setEngaged(true);
    if (invitation.kind === 'spontaneous') {
      setRating(value === rating ? null : value);
      return;
    }
    const previous = rating;
    setRating(value);
    if (!(await attempt(() => rate({ id: invitation.id, rating: value })))) setRating(previous);
  }

  async function submit() {
    const text = comment.trim();
    const sent = await attempt(() =>
      invitation.kind === 'invitation'
        ? addComment({ id: invitation.id, comment: text })
        : send({
            ...(rating === null ? {} : { rating }),
            ...(text ? { comment: text } : {}),
            route: window.location.pathname,
            release: portalRelease,
          }),
    );
    if (sent) setThanked(true);
  }

  const canSend = spontaneous ? rating !== null || comment.trim() !== '' : comment.trim() !== '';
  const showComment = spontaneous || rating !== null;

  return (
    <div
      ref={root}
      className="feedback-invite__frame"
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHeld(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          close();
        } else setEngaged(true);
      }}
    >
      {thanked ? (
        <Notice tone="success" elevated onDismiss={onClose}>
          Obrigado pela contribuição!
        </Notice>
      ) : (
        <Notice
          tone="info"
          icon={MessageSquareHeart}
          elevated
          title={feedbackQuestions[context]}
          titleProps={{ id: titleId }}
          onDismiss={close}
        >
          <div role="group" aria-labelledby={titleId} className="feedback-scale">
            {feedbackRatings.map((label, index) => {
              const value = index + 1;
              const Face = ratingFaces[index]!;
              return (
                <button
                  key={label}
                  type="button"
                  className="feedback-scale__option"
                  aria-pressed={rating === value}
                  disabled={pending}
                  onClick={() => void choose(value)}
                >
                  <Face aria-hidden="true" size={26} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
          {showComment ? (
            <form
              className="feedback-comment"
              onSubmit={(event) => {
                event.preventDefault();
                if (canSend) void submit();
              }}
            >
              <TextAreaField
                label={
                  spontaneous ? 'Comentário (opcional)' : 'Obrigado! Quer contar mais? (opcional)'
                }
                description="Seu nome acompanha o comentário."
                rows={3}
                maxLength={maximumFeedbackComment}
                value={comment}
                disabled={pending}
                onValueChange={(value) => {
                  setEngaged(true);
                  setComment(String(value));
                }}
              />
              <Button type="submit" pending={pending} loadingLabel="Enviando…" disabled={!canSend}>
                Enviar
              </Button>
            </form>
          ) : null}
          {error ? <p className="feedback-invite__error">{error}</p> : null}
        </Notice>
      )}
    </div>
  );
}
