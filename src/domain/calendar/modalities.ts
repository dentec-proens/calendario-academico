export { modalityLabels, selectableModalities } from './config.ts';
export const calendarModalities = <T extends string>(state: { modalities?: T[] }): T[] =>
  state.modalities ?? [];

export function appliesTo(event: { modalities?: string[]; offers?: string[] }, offerId: string) {
  const ids = event.offers ?? event.modalities;
  return !ids?.length || ids.includes(offerId);
}
