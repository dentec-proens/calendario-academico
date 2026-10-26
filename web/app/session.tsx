import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { useConvexAuth, useQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { functions } from '../shared/convex/client.ts';
import { nativeError } from '../shared/convex/errors.ts';
import type { Bootstrap, Notify, Status } from '../shared/convex/types.ts';
import { portalPermissions } from '../portal/permissions.ts';

export function sessionIdentity(user: Bootstrap['user']) {
  return `${user.id}:${user.role}:${user.campusId ?? 'institutional'}:${user.active}`;
}

interface EditorProtection {
  calendarId: string;
  info: Bootstrap;
  status: Status;
  beforeLogout: () => Promise<boolean>;
}

export interface SessionState {
  info: Bootstrap | undefined;
  status: Status | undefined;
  isLoading: boolean;
  isAuthenticated: boolean;
  notify: Notify;
  message: { text: string; error: boolean } | null;
  loggingOut: boolean;
  maintenance?: boolean;
  logout: () => Promise<void>;
  registerEditor?: (editor: EditorProtection) => () => void;
  editorRecovery?: { calendarId: string; checkingIdentity: boolean; discard: () => void };
}

const SessionContext = createContext<SessionState | null>(null);

export function AppSessionProvider({ children }: PropsWithChildren) {
  const auth = useConvexAuth();
  const { signOut } = useAuthActions();
  const status = useQuery(functions.access.session.status, {});
  const availability = useQuery(functions.operations.availability, {});
  const info = useQuery(
    functions.workspace.bootstrap,
    auth.isAuthenticated ? { includeCalendars: false } : 'skip',
  );
  const [confirmedInfo, setConfirmedInfo] = useState(info);
  if (info && info !== confirmedInfo) setConfirmedInfo(info);
  const [message, setMessage] = useState<SessionState['message']>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const editor = useRef<EditorProtection | null>(null);
  const [owner, setOwner] = useState<EditorProtection | null>(null);
  const [intentionalExit, setIntentionalExit] = useState(false);
  const observedAnonymous = useRef(!auth.isAuthenticated);
  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      observedAnonymous.current = true;
    } else if (auth.isAuthenticated && info && observedAnonymous.current) {
      observedAnonymous.current = false;
      setIntentionalExit(false);
    }
  }, [auth.isAuthenticated, auth.isLoading, info]);
  const registerEditor = useCallback((protection: EditorProtection) => {
    editor.current = protection;
    setOwner(protection);
    return () => {
      if (editor.current !== protection) return;
      editor.current = null;
      setOwner(null);
    };
  }, []);
  const sameOwner =
    owner &&
    ![info?.user, status?.user].some(
      (user) => user && sessionIdentity(user) !== sessionIdentity(owner.info.user),
    );
  const recovering =
    sameOwner && !intentionalExit && (auth.isLoading || !auth.isAuthenticated || !info);
  const consistentInfo =
    (auth.isAuthenticated || auth.isLoading) &&
    confirmedInfo &&
    (!status?.user || sessionIdentity(status.user) === sessionIdentity(confirmedInfo.user))
      ? confirmedInfo
      : undefined;
  const effectiveInfo = info ?? (recovering ? owner.info : consistentInfo);
  const effectiveStatus = status ?? (recovering ? owner.status : undefined);
  const notify = useCallback<Notify>((text, error = false) => setMessage({ text, error }), []);
  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      if (editor.current && !(await editor.current.beforeLogout())) return;
      setIntentionalExit(true);
      await signOut();
      setMessage({ text: 'Sessão encerrada.', error: false });
    } catch (error) {
      setIntentionalExit(false);
      notify(nativeError(error).message, true);
    } finally {
      setLoggingOut(false);
    }
  }
  return (
    <SessionContext.Provider
      value={{
        info: effectiveInfo,
        status: effectiveStatus,
        isLoading: recovering
          ? false
          : auth.isLoading || status === undefined || (auth.isAuthenticated && !info),
        isAuthenticated: auth.isAuthenticated,
        notify,
        message,
        loggingOut,
        maintenance: availability?.maintenance ?? false,
        logout,
        registerEditor,
        editorRecovery: recovering
          ? {
              calendarId: owner.calendarId,
              checkingIdentity: auth.isLoading || (auth.isAuthenticated && !info),
              discard: () => {
                editor.current = null;
                setOwner(null);
              },
            }
          : undefined,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSessionState() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('A sessão da aplicação precisa ser inicializada.');
  return session;
}

export function useAppSession() {
  const session = useSessionState();
  if (!session.info || !session.status) throw new Error('Aguarde o carregamento da sessão.');
  return {
    ...session,
    info: session.info,
    status: session.status,
    user: session.info.user,
    permissions: portalPermissions(session.info.user.role),
  };
}

export { SessionContext as AppSessionContext };
