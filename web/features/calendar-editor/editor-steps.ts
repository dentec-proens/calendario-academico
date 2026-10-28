import { editorSections, type EditorSection } from '../../../src/app-routes.ts';

function defineEditorPage<Section extends EditorSection>(
  section: Section,
  copy: { title: string; detail: string; description: string },
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
    detail: 'Dias regulares e referência',
    description:
      'Defina os dias regulares de atividades letivas e informe a referência da decisão.',
  }),
  periods: defineEditorPage('periods', {
    title: 'Organização letiva por oferta',
    detail: 'Períodos e etapas de avaliação',
    description: 'Defina os períodos de aulas e as etapas de avaliação em conjunto, por oferta.',
  }),
  assessments: defineEditorPage('assessments', {
    title: 'Etapas de avaliação',
    detail: 'Etapas e prazos por oferta',
    description: 'Organize as etapas de avaliação de cada oferta e confira suas datas.',
  }),
  days: defineEditorPage('days', {
    title: 'Sábados letivos',
    detail: 'Atividades ao longo do ano',
    description: 'Selecione os sábados letivos do ano e registre a decisão que os definiu.',
  }),
  vacations: defineEditorPage('vacations', {
    title: 'Férias docentes',
    detail: 'Períodos de férias do campus',
    description: 'Informe os períodos de férias docentes e a referência da decisão do campus.',
  }),
  events: defineEditorPage('events', {
    title: 'Atividades e datas do campus',
    detail: 'Resolução e atividades do campus',
    description: 'Registre as atividades e eventos da Resolução e do campus.',
  }),
  history: defineEditorPage('history', {
    title: 'Atividades e datas do campus',
    detail: 'Resolução e atividades do campus',
    description: 'Registre as atividades e eventos da Resolução e do campus.',
  }),
  issues: defineEditorPage('issues', {
    title: 'Revisão e conclusão',
    detail: 'Conferência e exportação',
    description: 'Confira as pendências e o resultado antes de concluir a elaboração.',
  }),
  calendar: defineEditorPage('calendar', {
    title: 'Visualizar calendário',
    detail: 'Distribuição do ano letivo',
    description:
      'Consulte a distribuição do ano e retorne à elaboração para ajustar as informações.',
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
