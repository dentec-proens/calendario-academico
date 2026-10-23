export const modalityLabels: Record<string, string> = {
  integrado: 'Técnico integrado',
  subsequente: 'Técnico subsequente',
  graduacao: 'Graduação',
  posgraduacao: 'Pós-graduação',
};
export const selectableModalities: ('integrado' | 'subsequente' | 'graduacao' | 'posgraduacao')[] =
  ['integrado', 'subsequente', 'graduacao', 'posgraduacao'];
export const calendarModalities = <T extends string>(state: { modalities?: T[] }): T[] =>
  state.modalities ?? [];

export function appliesTo(event: { modalities?: string[] }, modality: string) {
  return !event.modalities?.length || event.modalities.includes(modality);
}
