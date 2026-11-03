/**
 * Default categories that consup-292-2027-v6 (editorial) declares for activities that had none,
 * so a new date takes the colour of the PROENS legend instead of `prazo`. Frozen captures predate
 * it: tests compare them through `withDeclaredCategories`, which changes only `defaultCategory`.
 */
export const declaredCategories: Readonly<Record<string, string>> = {
  'pedagogical-meeting': 'institucional',
  'family-meeting': 'institucional',
  'campus-events': 'evento',
  'alumni-meeting': 'evento',
  'internship-event': 'evento',
  robotics: 'evento',
  'course-showcase': 'evento',
  'pedagogical-training': 'formacao',
  'collective-planning': 'formacao',
  'women-week': 'comemorativo',
  'ethics-week': 'comemorativo',
};

/** The declared category of a 2027 plan row ID (`family-meeting`, `pedagogical-meeting-1:integrado`). */
export const declaredCategory = (rowId: string): string | undefined =>
  declaredCategories[rowId.replace(/-\d+(:[\w-]+)?$/, '')];

/** Captured 2027 rows with the declared categories; every other field is kept. */
export const withDeclaredCategories = <T extends { id: string }>(rows: readonly T[]): T[] =>
  rows.map((row) => {
    const category = declaredCategory(row.id);
    return category ? { ...row, defaultCategory: category } : row;
  });
