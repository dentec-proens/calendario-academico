import { editorSections, type EditorSection } from '#src/app/routes.ts';
import { activityKey, isAssessmentStage } from '#src/domain/calendar/activities/activity-ref.ts';
import { isVacationActivity } from '#src/domain/calendar/activities/vacations.ts';
import type { ActivityPlanItem } from '#src/domain/calendar/model.ts';
import type { ContentIssue } from '#src/domain/calendar/readiness.ts';

function defineEditorPage<Section extends EditorSection>(
  section: Section,
  copy: { title: string },
) {
  return {
    section,
    path: `/calendarios/$calendarId/${editorSections[section]}` as const,
    ...copy,
  };
}

/** Copy and destinations shared by the sidebar, page heading and wizard actions. */
export const editorPages = {
  edit: defineEditorPage('edit', {
    title: 'Semana letiva',
  }),
  periods: defineEditorPage('periods', {
    title: 'Organização por oferta',
  }),
  assessments: defineEditorPage('assessments', {
    title: 'Etapas de avaliação',
  }),
  days: defineEditorPage('days', {
    title: 'Sábados letivos',
  }),
  vacations: defineEditorPage('vacations', {
    title: 'Férias',
  }),
  events: defineEditorPage('events', {
    title: 'Atividades',
  }),
  history: defineEditorPage('history', {
    title: 'Atividades',
  }),
  // Not a filling step: the record's operations, reached from the "Mais ações" menu.
  operations: defineEditorPage('operations', {
    title: 'Histórico do calendário',
  }),
  // Not a filling step either: reached from the Activities step and from a new calendar.
  copy: defineEditorPage('copy', {
    title: 'Copiar datas de outro calendário',
  }),
  issues: defineEditorPage('issues', {
    title: 'Conferir e enviar',
  }),
  calendar: defineEditorPage('calendar', {
    title: 'Visualizar calendário',
  }),
} satisfies { [Section in EditorSection]: { section: Section } };

export type EditorPage = (typeof editorPages)[EditorSection];

export const editorSteps = [
  editorPages.edit,
  editorPages.periods,
  editorPages.days,
  editorPages.vacations,
  editorPages.events,
  editorPages.issues,
] as const;

export function editorNavigation(section: EditorSection) {
  const destination =
    section === 'history' ? 'events' : section === 'assessments' ? 'periods' : section;
  const stepIndex = editorSteps.findIndex((step) => step.section === destination);
  return {
    current: editorPages[destination],
    active: stepIndex >= 0 ? editorSteps.at(stepIndex) : undefined,
    stepIndex,
    previous: stepIndex > 0 ? editorSteps.at(stepIndex - 1) : undefined,
    next: stepIndex >= 0 ? editorSteps.at(stepIndex + 1) : undefined,
  };
}

/** The step where a form with values not yet applied lives. */
export function unappliedFormSection(formId: string): EditorSection | undefined {
  if (formId === 'week') return 'edit';
  if (formId === 'vacations') return 'vacations';
  if (formId.startsWith('organization')) return 'periods';
  if (formId.startsWith('saturday')) return 'days';
  if (formId === 'event' || formId.startsWith('event')) return 'events';
  return undefined;
}

export function continueLabel(destination: Pick<EditorPage, 'title'>) {
  return `Continuar para ${destination.title.toLocaleLowerCase('pt-BR')}`;
}

/** The step where an issue is corrected, the same one its row in the review step leads to. */
export function issueSection({ target }: Pick<ContentIssue, 'target'>): EditorSection {
  switch (target?.area) {
    case 'organization':
      return 'periods';
    case 'activity':
      if (isVacationActivity(target.activity)) return 'vacations';
      return isAssessmentStage(target.activity) ? 'periods' : 'events';
    case 'date':
    case 'observance':
      return 'events';
    default:
      return 'issues';
  }
}

/** The page and filters that lead to a correction; nothing when there is no place to go. */
export function issueDestination({
  target,
}: Pick<ContentIssue, 'target'>):
  { to: EditorPage['path']; search: Record<string, string | undefined> } | undefined {
  switch (target?.area) {
    case 'organization':
      return { to: editorPages.periods.path, search: {} };
    case 'scope':
      return { to: editorPages.issues.path, search: {} };
    case 'activity':
      if (isVacationActivity(target.activity))
        return { to: editorPages.vacations.path, search: {} };
      // A link to an activity opens the by-activity view, whatever the URL had.
      return {
        to: (isAssessmentStage(target.activity) ? editorPages.periods : editorPages.events).path,
        search: { atividade: activityKey(target.activity), atividadeVisao: undefined },
      };
    case 'date':
      return {
        to: editorPages.events.path,
        search: { atividadeVisao: 'data', atividadeBusca: target.name },
      };
    case 'observance':
      return { to: editorPages.events.path, search: { atividadeOrigem: 'base' } };
    default:
      return undefined;
  }
}

/** Criteria answered outside the list of activities, by the same targets their issues use. */
const criterionTargets: Record<string, ContentIssue['target']> = {
  window: { area: 'organization' },
  II: { area: 'observance', key: '' },
};

/**
 * Where a campus corrects an unmet criterion, from the activities it covers today: the activity when
 * it is one, its step when several, and nothing for what no step decides (the day count depends on
 * the whole calendar; the minutes live in the SEI process).
 */
export function criterionDestination(
  plan: readonly Pick<ActivityPlanItem, 'activity' | 'reviewCriterionId'>[],
  criterionId: string,
): ReturnType<typeof issueDestination> {
  const covering = plan.filter((item) => item.reviewCriterionId === criterionId);
  if (!covering.length) return issueDestination({ target: criterionTargets[criterionId] });
  if (covering.every((item) => isVacationActivity(item.activity)))
    return { to: editorPages.vacations.path, search: {} };
  if (covering.every((item) => isAssessmentStage(item.activity)))
    return { to: editorPages.periods.path, search: {} };
  return covering.length === 1
    ? issueDestination({ target: { area: 'activity', activity: covering[0].activity } })
    : { to: editorPages.events.path, search: { atividade: undefined } };
}

/** Takes the focus to the pending norm, where its row in the review step leads. */
export function focusPendingScope() {
  const scope = document.getElementById('review-scope');
  scope?.scrollIntoView({ block: 'start' });
  scope?.querySelector<HTMLElement>('[role="radio"], button')?.focus({ preventScroll: true });
}

/**
 * Open issues by filling step. A step without issues is not a finished step, so this only ever
 * says what is missing. Each item counts once (`groupPendencies`), so the Activities step shows the
 * same number as its “A preencher” filter. The review step keeps the total, which also includes
 * what is resolved there.
 */
export function stepIssueCounts(issues: readonly Pick<ContentIssue, 'target'>[]) {
  const counts: Partial<Record<EditorSection, number>> = {};
  for (const issue of issues) {
    const section = issueSection(issue);
    if (section !== 'issues') counts[section] = (counts[section] ?? 0) + 1;
  }
  return counts;
}
