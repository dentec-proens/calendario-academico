import { editorSections, type EditorSection } from '#src/app/routes.ts';

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
    title: 'Atividades da Resolução',
  }),
  campus: defineEditorPage('campus', {
    title: 'Atividades do Campus',
  }),
  history: defineEditorPage('history', {
    title: 'Atividades da Resolução',
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
  editorPages.campus,
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
