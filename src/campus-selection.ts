export function selectableCampuses<T extends { name: string; archived?: boolean }>(campuses: T[]) {
  return campuses
    .filter((c) => !c.archived)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
}
