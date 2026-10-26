import type { PropsWithChildren } from 'react';

export default function SyntheticAuthProvider({ children }: PropsWithChildren) {
  return children;
}

export const useConvexAuth = () => ({ isLoading: false, isAuthenticated: false });
const actions = { signOut: () => Promise.resolve(), signIn: () => Promise.resolve() };
export const useAuthActions = () => actions;
export const useConvexConnectionState = () => ({
  isWebSocketConnected: true,
  hasEverConnected: true,
});
