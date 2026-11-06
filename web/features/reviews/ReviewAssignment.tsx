import { useState } from 'react';
import { UserCheck } from 'lucide-react';
import type { Id } from '../../../convex/_generated/dataModel.js';
import { Button } from '../../components/ui/Button.tsx';
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
    <div className="review-assignment">
      <p id="review-assignee">
        {!assignee
          ? 'Sem responsável: quem salvar o parecer passa a ser responsável por ele.'
          : mine
            ? 'Você é responsável por este parecer.'
            : `${assignee.name} é responsável por este parecer desde ${updatedLabel(assignee.at)}.`}
      </p>
      {mine ? (
        <Button
          id="release-review"
          variant="secondary"
          pending={pending}
          onClick={() => {
            if (busyReason) onMessage(busyReason, 'warning');
            else void run(() => reviews.release(calendarId), 'Parecer liberado.');
          }}
        >
          Liberar parecer
        </Button>
      ) : (
        <Button
          id="assume-review"
          variant="secondary"
          pending={pending}
          onClick={() => {
            if (assignee) void assumeReview(calendarId, assignee);
            else void run(() => reviews.assume(calendarId, null), 'Parecer assumido.');
          }}
        >
          <UserCheck size={18} aria-hidden="true" />
          Assumir parecer
        </Button>
      )}
    </div>
  );
}
