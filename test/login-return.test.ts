import { describe, expect, it } from 'vitest';
import { loginReturnTarget } from '../src/login-return.ts';

describe('return to the requested work page after signing in', () => {
  it.each(['/calendarios/calendar-a/eventos', '/documentos?ano=2027', '/logs'])(
    'resumes %s',
    (path) => {
      expect(
        loginReturnTarget('?retorno=' + encodeURIComponent(path), 'https://portal.example'),
      ).toBe(path);
    },
  );
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
  it('removes fragments and nested return parameters', () => {
    expect(
      loginReturnTarget(
        '?retorno=' + encodeURIComponent('/logs?retorno=/contas#token=secret'),
        'https://portal.example',
      ),
    ).toBe('/logs');
  });
});
