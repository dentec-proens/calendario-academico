export const nativeError = (cause: unknown) =>
  cause instanceof Error ? cause : new Error(String(cause));

window.routerAuthTest = { acceptedToken: null, resetToken: null };

export const accounts = {
  checkInvitation: (token: string | null) =>
    token
      ? Promise.resolve({
          name: 'Pessoa convidada',
          email: 'convite@example.invalid',
          role: 'CAMPUS',
          campus: 'Campus de teste',
          expiresAt: '2027-01-01T12:00:00Z',
        })
      : Promise.reject(new Error('Abra o link privado completo para continuar.')),
  acceptInvitation: (data: { token: string | null }) => {
    window.routerAuthTest.acceptedToken = data.token;
    return Promise.resolve();
  },
  passwordOptions: () => Promise.resolve({ emailEnabled: true }),
  requestPasswordRecovery: () => Promise.resolve({ message: 'Solicitação sintética registrada.' }),
  resetPassword: (data: { token: string | null }) => {
    window.routerAuthTest.resetToken = data.token;
    return Promise.resolve({ message: 'Senha sintética atualizada.' });
  },
};

declare global {
  interface Window {
    routerAuthTest: { acceptedToken: string | null; resetToken: string | null };
  }
}
