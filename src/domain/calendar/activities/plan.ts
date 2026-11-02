import type { AssessmentSettings, ActivityPlanItem } from '../model.ts';
import { policyFor } from '../../policies/registry.ts';
export function activityPlan(state: AssessmentSettings): ActivityPlanItem[] {
  const policy = policyFor(state.year);
  const requirements = policy.requirements(state);
  return policy.configured
    ? requirements
    : requirements.map((row) => ({
        ...row,
        required: false,
        applicability: 'unconfigured',
        reason: 'Ano ou escopo sem política normativa configurada.',
      }));
}
