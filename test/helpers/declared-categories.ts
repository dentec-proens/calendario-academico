/**
 * Default categories that consup-292-2027-v6 (editorial) declares for activities that had none,
 * so a new date takes the colour of the PROENS legend instead of `prazo`. The metadata test
 * derives the expected category from the editor's earlier rule plus these declarations.
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
