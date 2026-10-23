export function selectableCampuses(campuses) {
  return campuses
    .filter((c) => !c.archived)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
}
