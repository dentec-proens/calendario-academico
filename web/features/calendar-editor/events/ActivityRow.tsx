import type { ComponentProps } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  activityStatusLabels,
  type ActivityStatus,
} from '#src/domain/calendar/activities/status.ts';

type Props = Omit<ComponentProps<'button'>, 'children' | 'type' | 'className' | 'aria-current'> & {
  label: string;
  status: ActivityStatus;
  statusLabel?: string;
  dates: string;
  selected?: boolean;
};

/** Shared compact row for resolution activities, assessments and campus records. */
export default function ActivityRow({
  label,
  status,
  statusLabel = activityStatusLabels[status],
  dates,
  selected = false,
  ...props
}: Props) {
  return (
    <button {...props} type="button" className="activity-row" aria-current={selected || undefined}>
      <span className="activity-dot" data-status={status} aria-hidden="true" />
      <span className="activity-row-text">
        <span className="activity-row-name">{label}</span>
        <span className="activity-row-meta">
          <span className="activity-status" data-status={status}>
            {statusLabel}
          </span>
          <span>{dates}</span>
        </span>
      </span>
      <ChevronRight className="activity-row-chevron" aria-hidden="true" />
    </button>
  );
}
