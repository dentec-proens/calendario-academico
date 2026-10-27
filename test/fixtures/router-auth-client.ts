import { api } from '../../convex/_generated/api.js';
import { getFunctionName, type FunctionReference } from 'convex/server';

window.routerAuthTest = { acceptedToken: null, resetToken: null };
export const functions = api;
const connection = {
  isWebSocketConnected: true,
  hasEverConnected: true,
  timeOfOldestInflightRequest: null,
  hasInflightRequests: false,
  inflightMutations: 0,
  inflightActions: 0,
};

export const convex = {
  url: 'http://127.0.0.1',
  connectionState: () => connection,
  subscribeToConnectionState: () => () => {},
  query: (reference: FunctionReference<'query'>, args: Record<string, unknown>) => {
    switch (getFunctionName(reference)) {
      case 'access/invitations:checkInvitation':
        return args.token
          ? Promise.resolve({
              name: 'Pessoa convidada',
              email: 'convite@example.invalid',
              role: 'CAMPUS',
              campus: 'Campus de teste',
              expiresAt: Date.parse('2027-01-01T12:00:00Z'),
            })
          : Promise.reject(new Error('Abra o link privado completo para continuar.'));
      case 'access/session:passwordOptions':
        return Promise.resolve({ emailEnabled: true });
      default:
        return Promise.reject(new Error('Consulta sintética não implementada.'));
    }
  },
  action: (reference: FunctionReference<'action'>, args: Record<string, unknown>) => {
    switch (getFunctionName(reference)) {
      case 'access/invitations:acceptInvitation':
        window.routerAuthTest.acceptedToken = typeof args.token === 'string' ? args.token : null;
        return Promise.resolve();
      case 'access/passwordRecovery:resetPassword':
        window.routerAuthTest.resetToken = typeof args.token === 'string' ? args.token : null;
        return Promise.resolve({ message: 'Senha sintética atualizada.' });
      case 'access/passwordRecovery:requestPasswordRecovery':
        return Promise.resolve({ message: 'Solicitação sintética registrada.' });
      default:
        return Promise.reject(new Error('Action sintética não implementada.'));
    }
  },
};

declare global {
  interface Window {
    routerAuthTest: {
      googleRedirect?: boolean;
      acceptedToken: string | null;
      resetToken: string | null;
    };
  }
}
