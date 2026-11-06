import { ExternalLink } from 'lucide-react';
import { portalPaths } from '#src/app/routes.ts';
import type { ActivityPlanItem } from '#src/domain/calendar/model.ts';
import { activityRuleText } from '#src/domain/policy-references.ts';

/**
 * What the norm asks of the activity, beside the form that fills it. The rules open in another tab
 * because the panel holds a form in progress, which leaving the editor would put at risk.
 */
export default function ActivityRuleNote({
  year,
  item,
  withBasis,
}: {
  year: number;
  item: ActivityPlanItem;
  /** The activity's view already shows the article next to its status. */
  withBasis?: boolean;
}) {
  const text = activityRuleText(year, item);
  if (!text) return null;
  return (
    <p className="activity-rule" data-activity-rule>
      {text}
      {withBasis && item.basis ? ` (${item.basis})` : ''}{' '}
      <a href={`${portalPaths.rules}?ano=${year}`} target="_blank" rel="noopener">
        Ver regras do calendário
        <ExternalLink size={14} aria-hidden="true" />
        <span className="visually-hidden"> (abre em outra aba)</span>
      </a>
    </p>
  );
}
