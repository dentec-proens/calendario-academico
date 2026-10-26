import type { PropsWithChildren } from 'react';

export default function SyntheticAuthProvider({ children }: PropsWithChildren) {
  return children;
}

export const useConvexAuth = () => ({ isLoading: false, isAuthenticated: false });
export const useAuthActions = () => ({ signOut: () => Promise.resolve() });
export const useConvexConnectionState = () => ({
  isWebSocketConnected: true,
  hasEverConnected: true,
});
