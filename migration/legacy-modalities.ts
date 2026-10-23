export const modalityLabels: Record<string, string> = {
  integrado: 'Técnico integrado',
  subsequente: 'Técnico subsequente',
  graduacao: 'Graduação',
  posgraduacao: 'Pós-graduação',
  tecnico: 'Cursos técnicos (registro anterior)',
};
export const selectableModalities: ('integrado' | 'subsequente' | 'graduacao' | 'posgraduacao')[] =
  ['integrado', 'subsequente', 'graduacao', 'posgraduacao'];
export const calendarModalities = <T extends string>(state: {
  offer?: T;
  modalities?: T[];
}): T[] => (state.modalities?.length ? state.modalities : state.offer ? [state.offer] : []);

export function appliesTo(event: { modalities?: string[]; offers?: string[] }, modality: string) {
  const scope = event.modalities?.length ? event.modalities : event.offers;
  if (!scope?.length) return true;
  return (
    scope.includes(modality) ||
    (modality === 'tecnico' && scope.some((m) => ['integrado', 'subsequente'].includes(m))) ||
    (['integrado', 'subsequente'].includes(modality) && scope.includes('tecnico'))
  );
}
