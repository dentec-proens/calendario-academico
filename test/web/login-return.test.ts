import { describe, expect, it } from 'vitest';
import { loginReturnTarget } from '../../src/app/login-return.ts';

describe('return to the requested work page after signing in', () => {
  it.each([
    '/calendarios/calendar-a/eventos',
    '/calendarios/calendar-a/eventos#calendario-anterior',
    '/documentos?ano=2027',
    '/logs',
  ])('resumes %s', (path) => {
    expect(
      loginReturnTarget('?retorno=' + encodeURIComponent(path), 'https://portal.example'),
    ).toBe(path);
  });
  it.each([
    'https://external.example/calendarios',
    '//external.example/logs',
    '/ativar-conta#token=secret',
    '/recuperar-senha',
    '/',
    '/inexistente',
    'javascript:alert(1)',
  ])('rejects %s', (path) => {
    expect(
      loginReturnTarget('?retorno=' + encodeURIComponent(path), 'https://portal.example'),
    ).toBeUndefined();
  });
  it.each(['/logs#calendario-anterior', '/calendarios/calendar-a/eventos#token=secret'])(
    'strips unrecognized or misplaced fragments from %s',
    (path) => {
      expect(
        loginReturnTarget('?retorno=' + encodeURIComponent(path), 'https://portal.example'),
      ).toBe(path.split('#')[0]);
    },
  );
  it('removes fragments and nested return parameters', () => {
    expect(
      loginReturnTarget(
        '?retorno=' + encodeURIComponent('/logs?retorno=/contas#token=secret'),
        'https://portal.example',
      ),
    ).toBe('/logs');
  });
});
