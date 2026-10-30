import { LoadingIndicator } from '../../components/ui/LoadingIndicator.tsx';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueries, type RequestForQueries } from 'convex/react';
import { useFeatureRoute } from '../../app/navigation.ts';
import { functions } from '../../shared/convex/client.ts';
import type { Id } from '../../../convex/_generated/dataModel.js';
import ReviewEditor from './ReviewEditor.tsx';
import type { ReviewSupport } from './review-values.ts';
import { useFormDrafts } from '../../shared/forms/drafts.tsx';
import { Notice, type NoticeTone } from '../../components/ui/Notice.tsx';

export default function ReviewPage() {
  const calendarId = useFeatureRoute().calendarId || '';
  const [message, setMessage] = useState<{ text: string; tone: NoticeTone }>({
    text: '',
    tone: 'success',
  });
  const report = useCallback(
    (text: string, tone: NoticeTone = 'success') => setMessage({ text, tone }),
    [],
  );
  const drafts = useFormDrafts();
  // useQueries reports a removed calendar as a value instead of throwing to the error boundary.
  const requests = useMemo<RequestForQueries>(
    () => ({
      review: { query: functions.reviews.review, args: { id: calendarId as Id<'calendars'> } },
    }),
    [calendarId],
  );
  const result = useQueries(requests).review as ReviewSupport | Error | undefined;
  const opened = result instanceof Error ? undefined : result;
  useEffect(() => {
    if (result instanceof Error && /removido|não encontrado|disponível/i.test(result.message))
      drafts?.clear(`review:${calendarId}`);
  }, [calendarId, result, drafts]);
  const notice =
    result instanceof Error
      ? {
          tone: 'danger' as const,
          text: /removido|disponível/i.test(result.message)
            ? 'O calendário deixou de estar disponível para revisão. Volte à lista para escolher outro calendário.'
            : result.message,
        }
      : message.text
        ? message
        : null;
  return (
    <section id="review-panel" className="page" aria-busy={!result}>
      <div className="panel">
        <p>
          A revisão apoia o parecer; assinatura e tramitação ocorrem no SEI. Não constitui aprovação
          institucional.
        </p>
        {!result ? <LoadingIndicator label="Carregando parecer…" /> : null}
        <div id="review-message" role="status" aria-live="polite">
          {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
        </div>
        {opened ? (
          <ReviewEditor key={opened.calendar.id} opened={opened} onMessage={report} />
        ) : null}
      </div>
    </section>
  );
}
