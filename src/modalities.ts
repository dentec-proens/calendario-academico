export { modalityLabels, selectableModalities } from './calendar-config.ts';
export const calendarModalities = <T extends string>(state: { modalities?: T[] }): T[] =>
  state.modalities ?? [];

export function appliesTo(event: { modalities?: string[] }, modality: string) {
  return !event.modalities?.length || event.modalities.includes(modality);
}
