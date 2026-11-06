import { useState } from 'react';
import type { Id } from '../../../convex/_generated/dataModel.js';
import type { NoticeTone } from '../../components/ui/Notice.tsx';
import { nativeError } from '../../shared/convex/errors.ts';
import { reviews } from '../../shared/convex/reviews.ts';
import { updatedLabel } from '../../shared/dates.ts';
import { assumeReview } from './review-assignment.ts';
import type { ReviewSupport } from './review-values.ts';

/** Who holds the parecer now. It reads the live query, so a change never touches a draft. */
export default function ReviewAssignment({
  calendarId,
  assignee,
  userId,
  busyReason,
  onMessage,
}: {
  calendarId: string;
  assignee: ReviewSupport['assignee'];
  userId: Id<'users'>;
  /** Why releasing must wait, such as unsaved work that would be left without a holder. */
  busyReason: string;
  onMessage: (message: string, tone?: NoticeTone) => void;
}) {
  const [pending, setPending] = useState(false);
  async function run(operation: () => Promise<unknown>, done: string) {
    setPending(true);
    try {
      await operation();
      onMessage(done);
    } catch (cause) {
      onMessage(nativeError(cause).message, 'danger');
    } finally {
      setPending(false);
    }
  }
  const mine = assignee?.id === userId;
  return (
    <>
      <span id="review-assignee" className="review-summary__value">
        {!assignee ? 'Ninguém ainda' : mine ? 'Você' : assignee.name}
      </span>
      <small>
        {!assignee
          ? 'Quem salvar o parecer passa a ser responsável.'
          : `Desde ${updatedLabel(assignee.at)}`}
      </small>
      {mine ? (
        <button
          id="release-review"
          type="button"
          className="review-summary__action"
          disabled={pending}
          onClick={() => {
            if (busyReason) onMessage(busyReason, 'warning');
            else void run(() => reviews.release(calendarId), 'Parecer liberado.');
          }}
        >
          Liberar parecer
        </button>
      ) : (
        <button
          id="assume-review"
          type="button"
          className="review-summary__action"
          disabled={pending}
          onClick={() => {
            if (assignee) void assumeReview(calendarId, assignee);
            else void run(() => reviews.assume(calendarId, null), 'Parecer assumido.');
          }}
        >
          Assumir parecer
        </button>
      )}
    </>
  );
}
