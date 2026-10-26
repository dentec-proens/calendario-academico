import { afterEach, expect, it, vi } from 'vitest';
import { accounts, setAuthActions } from '../web/native/client.ts';

vi.mock('../web/native/runtime.ts', () => ({ convex: {}, functions: {} }));
afterEach(() => vi.unstubAllGlobals());

it('Google sign-in returns to the requested page without copying a private fragment', async () => {
  vi.stubGlobal('window', {
    location: new URL(
      'https://portal.example/?retorno=%2Fcalendarios%2Fcalendar-a%2Fhistorico#token=private',
    ),
  });
  const signIn = vi.fn().mockResolvedValue({ signingIn: false });
  setAuthActions({ signIn, signOut: vi.fn().mockResolvedValue(undefined) });
  await accounts.signInGoogle();
  expect(signIn).toHaveBeenCalledWith('google', {
    redirectTo: 'https://portal.example/?retorno=%2Fcalendarios%2Fcalendar-a%2Fhistorico',
  });
});
