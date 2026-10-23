import { useEffect } from 'react';
import { ConvexAuthProvider, useAuthActions } from '@convex-dev/auth/react';
import { convex, setAuthActions } from './client.js';

function AuthBridge({ children }) {
  const actions = useAuthActions();
  useEffect(() => setAuthActions(actions), [actions]);
  return children;
}

export default function NativeProvider({ children }) {
  return (
    <ConvexAuthProvider client={convex}>
      <AuthBridge>{children}</AuthBridge>
    </ConvexAuthProvider>
  );
}
