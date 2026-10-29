import { describe, expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  catalogueEventId,
  editorUrl,
  editorSections,
  pageDocument,
  parseEditorPath,
  portalCreationPaths,
  portalFormForPath,
  portalPageForPath,
  portalPaths,
  type PortalPageId,
} from '../../src/app/routes.ts';

describe('application paths', () => {
  test('assessment and vacation steps have independent direct URLs', () => {
    for (const section of ['assessments', 'vacations'] as const) {
      const path = editorUrl('calendar-a', section);
      expect(path).toBe(`/calendarios/calendar-a/${editorSections[section]}`);
      expect(parseEditorPath(path)).toEqual({ id: 'calendar-a', section });
      expect(parseEditorPath(path + '/')).toEqual({ id: 'calendar-a', section });
      expect(pageDocument(path)).toBe('index.html');
    }
  });
  test('matches collection and creation routes without confusing calendar IDs with collections', () => {
    for (const page of Object.keys(portalPaths) as PortalPageId[]) {
      expect(portalPageForPath(portalPaths[page])).toBe(page);
      expect(portalFormForPath(portalPaths[page])).toBe(false);
      expect(pageDocument(portalPaths[page])).toBe('index.html');
      const create = portalCreationPaths[page];
      if (create) {
        expect(portalPageForPath(create)).toBe(page);
        expect(portalFormForPath(create)).toBe(true);
      }
    }
    expect(portalPageForPath('/revisoes/calendar-a')).toBe('review-panel');
    expect(portalPageForPath('/eventos-institucionais/event-a/editar')).toBe('institution-events');
    expect(portalFormForPath('/eventos-institucionais/event-a/editar')).toBe(true);
    expect(catalogueEventId('/eventos-institucionais/event-a/editar')).toBe('event-a');
    expect(catalogueEventId('/eventos-institucionais/novo')).toBeUndefined();
    expect(parseEditorPath(editorUrl('calendar-a', 'history'))).toEqual({
      id: 'calendar-a',
      section: 'history',
    });
    expect(pageDocument('/calendarios/calendar-a/historico')).toBe('index.html');
    expect(portalPageForPath('/calendarios/calendar-a/historico')).toBeUndefined();
  });

  test.each([
    '/portal',
    '/editor',
    '/ativar',
    '/portal.html',
    '/index.html',
    '/editor.html',
    '/recover.html',
    '/activate.html',
    '/logs.html',
    '/api/status',
    '/assets/missing.js',
    '/not-a-route',
    '/revisoes/x/y',
    '/calendarios/x/not-a-section',
    '/calendarios/%2f/editar',
    '/calendarios/%5c/editar',
    '/calendarios/%00/editar',
    '/calendarios/%ZZ/editar',
    '/eventos-institucionais/%2f/editar',
    '/eventos-institucionais/event-a/unknown',
  ])('rejects unknown or malformed path %s', (path) => {
    expect(pageDocument(path)).toBeUndefined();
  });

  test('Vercel rewrites select the same document as the local server', async () => {
    const config = JSON.parse(
      await readFile(new URL('../../vercel.json', import.meta.url), 'utf8'),
    ) as { rewrites: Array<{ source: string; destination: string }> };
    for (const rewrite of config.rewrites)
      expect(
        pageDocument(rewrite.source.replace(/:(?:calendar|event)Id/g, 'fixture')),
      ).toBeDefined();
    const routes = [
      ...Object.values(portalPaths),
      ...Object.values(portalCreationPaths).filter((path) => path !== undefined),
      '/revisoes/calendar-a',
      '/eventos-institucionais/event-a/editar',
      '/calendarios/calendar-a/editar',
      '/calendarios/calendar-a/periodos',
      '/calendarios/calendar-a/avaliacoes',
      '/calendarios/calendar-a/dias',
      '/calendarios/calendar-a/ferias',
      '/calendarios/calendar-a/eventos',
      '/calendarios/calendar-a/historico',
      '/calendarios/calendar-a/pendencias',
      '/calendarios/calendar-a/visualizar',
      '/',
      '/logs',
      '/ativar-conta',
      '/recuperar-senha',
    ];
    for (const path of routes) {
      const rewrite = config.rewrites.find(({ source }) =>
        new RegExp(`^${source.replace(/:(?:calendar|event)Id/g, '[^/]+')}$`).test(path),
      );
      expect(rewrite?.destination, path).toBe('/' + pageDocument(path));
    }
    for (const path of [
      '/api/status',
      '/assets/missing.js',
      '/calendarios/x/inexistente',
      '/revisoes/x/y',
    ]) {
      expect(
        config.rewrites.some(({ source }) =>
          new RegExp(`^${source.replace(/:(?:calendar|event)Id/g, '[^/]+')}$`).test(path),
        ),
        path,
      ).toBe(false);
    }
  });
});
