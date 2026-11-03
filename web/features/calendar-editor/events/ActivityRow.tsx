import type { ComponentProps } from 'react';
import { ChevronRight } from 'lucide-react';
import { StatusBadge } from '../../../components/ui/Feedback.tsx';
import { CategoryMark } from '../../../components/ui/CategoryMark.tsx';
import {
  situationLabels,
  type ActivitySituation,
} from '#src/domain/calendar/activities/plan-evaluation.ts';

type Props = Omit<ComponentProps<'button'>, 'children' | 'type' | 'className' | 'aria-current'> & {
  label: string;
  status: ActivitySituation;
  statusLabel?: string;
  /** Shows the status in the information blue when it names a kind of date, not a situation. */
  tone?: 'info';
  dates: string;
  /** A date row shows the legend color of its category before the dates. */
  category?: { category?: string; effect?: string };
  /** Context shown after the dates, such as the activity or the recorded link of a date. */
  note?: string;
  /** The date has a draft not yet applied, kept under its ID. */
  pendingDraft?: boolean;
  /** An internal date of the campus (art. 18), shown with the **Interna** badge. */
  internal?: boolean;
  selected?: boolean;
};

/** Shared compact row for activities and dates of the Activities step. */
export default function ActivityRow({
  label,
  status,
  statusLabel = situationLabels[status],
  tone,
  dates,
  category,
  note,
  pendingDraft = false,
  internal = false,
  selected = false,
  ...props
}: Props) {
  return (
    <button {...props} type="button" className="activity-row" aria-current={selected || undefined}>
      <span className="activity-dot" data-status={status} data-tone={tone} aria-hidden="true" />
      <span className="activity-row-text">
        <span className="activity-row-name">
          {label}
          {internal && (
            <StatusBadge className="activity-row-badge" data-internal-badge>
              Interna
            </StatusBadge>
          )}
        </span>
        <span className="activity-row-meta">
          <span className="activity-status" data-status={status} data-tone={tone}>
            {statusLabel}
          </span>
          {category && <CategoryMark event={category} />}
          <span>{dates}</span>
          {note && <span className="activity-row-note">{note}</span>}
          {pendingDraft && (
            <span className="activity-row-note" data-pending-draft>
              Alterações não aplicadas
            </span>
          )}
        </span>
      </span>
      <ChevronRight className="activity-row-chevron" aria-hidden="true" />
    </button>
  );
}
