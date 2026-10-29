import type { AssessmentSettings, ActivityRequirement } from '../model.ts';
import { policyFor } from '../../policies/registry.ts';
export function activityChecklist(state: AssessmentSettings): ActivityRequirement[] {
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
