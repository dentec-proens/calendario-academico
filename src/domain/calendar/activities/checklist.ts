import type { AssessmentSettings, ActivityRequirement } from '../model.ts';
import { requirements2027 } from '../policies/consup-292-2027.ts';
import { legacyActivityChecklist } from '../policies/legacy-2026.ts';
export function activityChecklist(state: AssessmentSettings): ActivityRequirement[] {
  return state.year === 2027
    ? requirements2027(state)
    : state.year === 2026
      ? legacyActivityChecklist(state)
      : legacyActivityChecklist(state).map((row) => ({
          ...row,
          required: false,
          applicability: 'unconfigured',
          reason: 'Ano ou escopo sem política normativa configurada.',
        }));
}
