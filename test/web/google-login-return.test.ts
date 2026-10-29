import { afterEach, expect, it, vi } from 'vitest';
import { createAccountActions } from '../../web/shared/convex/accounts.ts';

vi.mock('../../web/shared/convex/client.ts', () => ({ convex: {}, functions: {} }));
afterEach(() => vi.unstubAllGlobals());

it('Google sign-in returns to the requested page without copying a private fragment', async () => {
  vi.stubGlobal('window', {
    location: new URL(
      'https://portal.example/?retorno=%2Fcalendarios%2Fcalendar-a%2Fhistorico#token=private',
    ),
  });
  const signIn = vi.fn().mockResolvedValue({ signingIn: false });
  const accounts = createAccountActions({ signIn, signOut: vi.fn().mockResolvedValue(undefined) });
  await accounts.signInGoogle();
  expect(signIn).toHaveBeenCalledWith('google', {
    redirectTo: 'https://portal.example/?retorno=%2Fcalendarios%2Fcalendar-a%2Fhistorico',
  });
});
