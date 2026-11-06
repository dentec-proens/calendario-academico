import { editorSections, type EditorSection } from '#src/app/routes.ts';
import { isAssessmentStage } from '#src/domain/calendar/activities/activity-ref.ts';
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
    title: 'Férias docentes',
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
  issues: defineEditorPage('issues', {
    title: 'Revisão e conclusão',
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

export function continueLabel(destination: Pick<EditorPage, 'title'>) {
  return `Continuar para ${destination.title.toLocaleLowerCase('pt-BR')}`;
}

/** The step where an issue is corrected, the same one its row in the review step leads to. */
export function issueSection({ target }: Pick<ContentIssue, 'target'>): EditorSection {
  switch (target?.area) {
    case 'organization':
      return 'periods';
    case 'activity':
      return isAssessmentStage(target.activity) ? 'periods' : 'events';
    case 'date':
    case 'observance':
      return 'events';
    default:
      return 'issues';
  }
}

/**
 * Open issues by filling step. A step without issues is not a finished step, so this only ever
 * says what is missing. The review step keeps the total, which also includes what is resolved there.
 */
export function stepIssueCounts(issues: readonly Pick<ContentIssue, 'target'>[]) {
  const counts: Partial<Record<EditorSection, number>> = {};
  for (const issue of issues) {
    const section = issueSection(issue);
    if (section !== 'issues') counts[section] = (counts[section] ?? 0) + 1;
  }
  return counts;
}
