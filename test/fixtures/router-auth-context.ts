import type { PropsWithChildren } from 'react';

export default function SyntheticAuthProvider({ children }: PropsWithChildren) {
  return children;
}

export const useConvexAuth = () => ({ isLoading: false, isAuthenticated: false });
const actions = {
  signOut: () => Promise.resolve(),
  signIn: (provider: string) => {
    if (provider === 'google' && window.routerAuthTest?.googleRedirect)
      window.location.href = '/oauth-complete';
    return Promise.resolve();
  },
};
export const useAuthActions = () => actions;
export const useConvexConnectionState = () => ({
  isWebSocketConnected: true,
  hasEverConnected: true,
});
