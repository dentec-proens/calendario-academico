import { useAuthActions } from '@convex-dev/auth/react';
import { useMemo } from 'react';
import type { FunctionArgs } from 'convex/server';
import type { Id } from '../../../convex/_generated/dataModel.js';
import { convex, functions } from './client.ts';
import { request } from './errors.ts';

function requiredToken(token: string | null): string {
  if (!token) throw new Error('Abra o link privado completo para continuar.');
  return token;
}

const accountOperations = {
  status: () => request(() => convex.query(functions.access.session.status, {})),
  setup: (data: FunctionArgs<typeof functions.access.setup.setup>['data']) =>
    request(() => convex.action(functions.access.setup.setup, { data })),
  passwordOptions: () => request(() => convex.query(functions.access.session.passwordOptions, {})),
  checkInvitation: (token: string | null) =>
    request(() =>
      convex.query(functions.access.invitations.checkInvitation, { token: requiredToken(token) }),
    ),
  acceptInvitation: (data: { token: string | null; email: string; password: string }) =>
    request(() =>
      convex.action(functions.access.invitations.acceptInvitation, {
        ...data,
        token: requiredToken(data.token),
      }),
    ),
  resetPassword: (data: { token: string | null; password: string }) =>
    request(() =>
      convex.action(functions.access.passwordRecovery.resetPassword, {
        ...data,
        token: requiredToken(data.token),
      }),
    ),
  requestPasswordRecovery: (email: string) =>
    request(() =>
      convex.action(functions.access.passwordRecovery.requestPasswordRecovery, { email }),
    ),
  createMember: (data: FunctionArgs<typeof functions.access.members.createMember>['data']) =>
    request(() => convex.action(functions.access.members.createMember, { data })),
  updateMemberRole: (args: FunctionArgs<typeof functions.access.members.updateMemberRole>) =>
    request(() => convex.mutation(functions.access.members.updateMemberRole, args)),
  unlockPassword: (id: string) =>
    request(() =>
      convex.mutation(functions.access.security.unlockPassword, { id: id as Id<'users'> }),
    ),
  removeMember: (id: string) =>
    request(() =>
      convex.mutation(functions.access.members.removeMember, { id: id as Id<'users'> }),
    ),
  issueInvitation: (id: string) =>
    request(() =>
      convex.mutation(functions.access.invitations.issueInvitation, { id: id as Id<'users'> }),
    ),
  passwordRecovery: (id: string) =>
    request(() =>
      convex.mutation(functions.access.passwordRecovery.passwordRecovery, {
        id: id as Id<'users'>,
      }),
    ),
};

export function createAccountActions(actions: ReturnType<typeof useAuthActions>) {
  return {
    ...accountOperations,
    signIn: (credentials: { email: string; password: string }) =>
      request(() => actions.signIn('password', { flow: 'signIn', ...credentials })),
    signInGoogle: () =>
      request(() =>
        actions.signIn('google', {
          redirectTo: window.location.origin + window.location.pathname + window.location.search,
        }),
      ),
  };
}

export function useAccounts() {
  const actions = useAuthActions();
  return useMemo(() => createAccountActions(actions), [actions]);
}
