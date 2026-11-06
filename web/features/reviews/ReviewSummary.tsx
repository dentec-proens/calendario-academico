import { CheckCircle2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { reviewEditable } from '#src/domain/calendar/lifecycle.ts';
import { Notice } from '../../components/ui/Notice.tsx';
import { updatedLabel } from '../../shared/dates.ts';
import {
  comparisonHeadline,
  type SubmissionComparisonState,
} from '../lifecycle/SubmissionComparison.tsx';
import type { ReviewSupport } from './review-values.ts';

function SummaryItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="review-summary__item">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** The state of the parecer at a glance. A problem also gets a notice; a clean state stays quiet. */
export default function ReviewSummary({
  opened,
  userId,
  reviewedCount,
  assignment,
  comparison,
  comparisonOpen,
  onToggleComparison,
}: {
  opened: ReviewSupport;
  userId: string;
  /** Counted from the form, so it follows what the reviewer confirms before saving. */
  reviewedCount: number;
  assignment: ReactNode;
  comparison: SubmissionComparisonState | null;
  comparisonOpen: boolean;
  onToggleComparison: () => void;
}) {
  const total = opened.criteria.length;
  const conflicts = opened.conflicts.length;
  const editable = reviewEditable(opened.status);
  const heldBy =
    editable && opened.assignee && opened.assignee.id !== userId ? opened.assignee.name : null;
  const headline = comparison ? comparisonHeadline(comparison) : null;
  return (
    <>
      <dl id="review-summary" className="review-summary">
        {editable ? <SummaryItem label="Responsável">{assignment}</SummaryItem> : null}
        <SummaryItem label="Critérios avaliados">
          <span id="review-progress" className="review-summary__value">
            {reviewedCount} de {total}
          </span>
          <progress value={reviewedCount} max={total} aria-label="Critérios avaliados" />
        </SummaryItem>
        <SummaryItem label="Inclusão/exclusão">
          <span
            id="review-conflicts"
            className="review-summary__value"
            data-tone={conflicts || opened.countError ? 'warning' : 'success'}
          >
            {conflicts ? (
              `${conflicts} ${conflicts === 1 ? 'conflito' : 'conflitos'}`
            ) : opened.countError ? (
              'A conferir'
            ) : (
              <>
                <CheckCircle2 size={16} aria-hidden="true" /> Sem conflitos
              </>
            )}
          </span>
        </SummaryItem>
        {headline ? (
          <SummaryItem label="Comparação">
            <span id="review-comparison-headline" className="review-summary__value">
              {headline.value}
            </span>
            {headline.detail ? <small>{headline.detail}</small> : null}
            <button
              id="toggle-comparison"
              type="button"
              className="review-summary__action"
              aria-expanded={comparisonOpen}
              aria-controls="review-comparison-panel"
              onClick={onToggleComparison}
            >
              {comparisonOpen
                ? 'Ocultar detalhes'
                : comparison?.base
                  ? 'Ver alterações'
                  : 'Ver histórico'}
            </button>
          </SummaryItem>
        ) : null}
        {opened.review ? (
          <SummaryItem label="Último registro">
            <span id="review-author" className="review-summary__value">
              Revisão {opened.review.revision}
            </span>
            <small>
              {opened.review.reviewer.name} · {updatedLabel(opened.review.updatedAt)}
            </small>
          </SummaryItem>
        ) : null}
      </dl>
      {heldBy ? (
        <Notice tone="warning" id="review-held-notice">
          Parecer com {heldBy}: fica em consulta até que você o assuma.
        </Notice>
      ) : null}
      {opened.stale ? (
        <Notice tone="warning" id="review-stale-notice">
          Revisão desatualizada: o calendário ou a base institucional mudou depois do último
          registro.{editable ? ' Reavalie os critérios e salve o parecer de novo.' : ''}
        </Notice>
      ) : null}
      {conflicts ? (
        <Notice tone="warning" id="review-conflicts-notice">
          Conflitos de inclusão/exclusão em{' '}
          {opened.conflicts.map((conflict) => conflict.date).join(', ')}. Confira no editor.
        </Notice>
      ) : opened.countError ? (
        <Notice tone="warning" id="review-conflicts-notice">
          {opened.countError}
        </Notice>
      ) : null}
    </>
  );
}
