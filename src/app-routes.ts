/** Public URLs shared by the router, local servers and navigation links. */
export const portalPaths = {
  calendars: '/calendarios',
  institution: '/documentos',
  'institution-events': '/eventos-institucionais',
  'review-panel': '/revisoes',
  campuses: '/campi',
  accounts: '/contas',
  'online-users': '/usuarios-online',
} as const;

export type PortalPageId = keyof typeof portalPaths;

export const portalCreationPaths: Partial<Record<PortalPageId, string>> = {
  calendars: '/calendarios/novo',
  institution: '/documentos/novo',
  'institution-events': '/eventos-institucionais/novo',
  campuses: '/campi/novo',
  accounts: '/contas/nova',
};

export const editorSections = {
  edit: 'editar',
  periods: 'periodos',
  days: 'dias',
  events: 'eventos',
  history: 'historico',
  issues: 'pendencias',
  calendar: 'visualizar',
} as const;

export type EditorSection = keyof typeof editorSections;

export function editorUrl(id: string, section: EditorSection = 'edit') {
  return `/calendarios/${encodeURIComponent(id)}/${editorSections[section]}`;
}

function withoutTrailingSlash(pathname: string) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

function routeId(segment: string): string | undefined {
  try {
    const id = decodeURIComponent(segment);
    return id &&
      !id.includes('/') &&
      !id.includes('\\') &&
      !id.includes('\0') &&
      id !== '.' &&
      id !== '..'
      ? id
      : undefined;
  } catch {
    return undefined;
  }
}

export function parseEditorPath(
  pathname: string,
): { id: string; section: EditorSection } | undefined {
  const match = /^\/calendarios\/([^/]+)\/([^/]+)$/.exec(withoutTrailingSlash(pathname));
  if (!match) return undefined;
  const id = routeId(match[1]);
  const section = (Object.keys(editorSections) as EditorSection[]).find(
    (key) => editorSections[key] === match[2],
  );
  return id && section ? { id, section } : undefined;
}

export function portalPageForPath(pathname: string): PortalPageId | undefined {
  const path = withoutTrailingSlash(pathname);
  const page = (Object.keys(portalPaths) as PortalPageId[]).find(
    (id) => portalPaths[id] === path || portalCreationPaths[id] === path,
  );
  if (catalogueEventId(path)) return 'institution-events';
  return (
    page ??
    (/^\/revisoes\/[^/]+$/.test(path) && routeId(path.split('/')[2]) ? 'review-panel' : undefined)
  );
}

export function catalogueEventId(pathname: string): string | undefined {
  const match = /^\/eventos-institucionais\/([^/]+)\/editar$/.exec(withoutTrailingSlash(pathname));
  return match ? routeId(match[1]) : undefined;
}

export function portalFormForPath(pathname: string) {
  return (
    Object.values(portalCreationPaths).includes(withoutTrailingSlash(pathname)) ||
    !!catalogueEventId(pathname)
  );
}

export const pageRoutes = new Map<string, string>([
  ['/', 'index.html'],
  ['/logs', 'logs.html'],
  ['/recuperar-senha', 'recover.html'],
  ['/ativar-conta', 'activate.html'],
]);

/** Only known application routes receive an HTML shell; assets and APIs keep real 404s. */
export function pageDocument(pathname: string): string | undefined {
  const path = withoutTrailingSlash(pathname);
  return (
    pageRoutes.get(path) ??
    (portalPageForPath(path) ? 'portal.html' : parseEditorPath(path) ? 'editor.html' : undefined)
  );
}
