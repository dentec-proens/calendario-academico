import { useEffect, type PropsWithChildren } from 'react';
import { ConvexAuthProvider, useAuthActions } from '@convex-dev/auth/react';
import ConfirmationDialogHost from '../components/ConfirmationDialog.tsx';
import { convex, setAuthActions } from './client.ts';

function AuthBridge({ children }: PropsWithChildren) {
  const actions = useAuthActions();
  useEffect(() => setAuthActions(actions), [actions]);
  return children;
}

export default function NativeProvider({ children }: PropsWithChildren) {
  return (
    <ConvexAuthProvider client={convex}>
      <AuthBridge>
        {children}
        <ConfirmationDialogHost />
      </AuthBridge>
    </ConvexAuthProvider>
  );
}
