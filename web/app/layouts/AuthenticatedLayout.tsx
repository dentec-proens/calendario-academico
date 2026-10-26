import { Outlet } from '@tanstack/react-router';
import { useSessionState } from '../session.tsx';

export default function AuthenticatedLayout() {
  const { isLoading, isAuthenticated, info, editorRecovery } = useSessionState();
  return editorRecovery || (!isLoading && isAuthenticated && info) ? <Outlet /> : null;
}
