import { useSyncExternalStore } from 'react';
import { getFunctionName, type FunctionReference } from 'convex/server';
import { ConvexError } from 'convex/values';
import { convex as editorClient } from './editor-event-drafts-client.ts';
import { record } from './editor-client.ts';
import type { Bootstrap, Status } from '../../web/shared/convex/types.ts';
import type { Id } from '../../convex/_generated/dataModel.js';
export { functions } from './editor-client.ts';

export const info: Bootstrap = {
  user: {
    id: 'editor-user' as Id<'users'>,
    name: 'Pessoa de teste',
    email: 'editor@example.invalid',
    role: 'ADMIN',
    campusId: null,
    active: true,
    inviteExpiresAt: null,
    loginMethod: 'local',
  },
  campuses: [{ id: record.campusId, name: record.state.campus, archived: false }],
  users: [],
  calendars: [],
  catalogue: { revision: 1, events: [] },
};
const subscribers = new Set<() => void>();
let authenticated = true;
let loadingBootstrap = false;
/** A new tab can open while the expansion is already under way (set by an init script). */
const initial = window.editorSessionInitial ?? {};
let maintenance = initial.maintenance ?? false;
/** The bootstrap answers the maintenance unavailability (503), as during an expansion. */
let bootstrapUnavailable = initial.bootstrapUnavailable ?? false;
let holdSaves = false;
const pendingSaves: Array<() => void> = [];
export const counters = { signOuts: 0, saveStarted: 0 };
function publishSession() {
  subscribers.forEach((listener) => listener());
}
const subscribe = (listener: () => void) => {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
};
const fetchAccessToken = () => Promise.resolve(authenticated ? 'synthetic-token' : null);
export function useFixtureAuth() {
  const isAuthenticated = useSyncExternalStore(subscribe, () => authenticated);
  return { isAuthenticated, isLoading: false, fetchAccessToken };
}
export const actions = {
  signOut: () => {
    counters.signOuts++;
    authenticated = false;
    publishSession();
    return Promise.resolve();
  },
  signIn: () => {
    authenticated = true;
    publishSession();
    return Promise.resolve();
  },
};
function sessionResult(name: string) {
  if (name === 'operations:availability') return { maintenance };
  if (name === 'workspace:bootstrap') {
    if (bootstrapUnavailable)
      return new ConvexError({
        status: 503,
        error: 'Aplicação em manutenção. Aguarde a conclusão e recarregue a página.',
      });
    return loadingBootstrap ? undefined : structuredClone(info);
  }
  return {
    setupRequired: false,
    hosted: true,
    googleEnabled: false,
    user: authenticated ? info.user : null,
  } satisfies Status;
}
export const convex = {
  ...editorClient,
  setAuth(_fetch: unknown, callback: (authenticated: boolean) => void) {
    queueMicrotask(() => callback(authenticated));
  },
  clearAuth() {},
  watchQuery(reference: FunctionReference<'query'>) {
    const name = getFunctionName(reference);
    if (
      name !== 'workspace:bootstrap' &&
      name !== 'access/session:status' &&
      name !== 'operations:availability'
    )
      return editorClient.watchQuery(reference);
    let cached = sessionResult(name);
    return {
      localQueryResult: () => {
        // A query that failed on the server throws from the local result, as the real client.
        if (cached instanceof Error) throw cached;
        return cached;
      },
      journal: () => undefined,
      onUpdate(callback: () => void) {
        return subscribe(() => {
          cached = sessionResult(name);
          callback();
        });
      },
    };
  },
  mutation(reference: FunctionReference<'mutation'>, args: Record<string, unknown>) {
    if (getFunctionName(reference) !== 'calendars:saveCalendar')
      return editorClient.mutation(reference, args);
    counters.saveStarted++;
    if (!authenticated)
      return Promise.reject(Object.assign(new Error('Sessão expirada.'), { status: 401 }));
    if (!holdSaves) return editorClient.mutation(reference, args);
    return new Promise((resolve, reject) =>
      pendingSaves.push(() => {
        editorClient.mutation(reference, args).then(resolve, reject);
      }),
    );
  },
};
window.editorSessionTest = {
  counters,
  expire() {
    authenticated = false;
    publishSession();
  },
  holdSaves() {
    holdSaves = true;
  },
  releaseSaves() {
    holdSaves = false;
    pendingSaves.splice(0).forEach((release) => release());
  },
  switchUser(id: string, role: Bootstrap['user']['role'] = 'ADMIN') {
    info.user.id = id as Id<'users'>;
    info.user.role = role;
    authenticated = true;
    publishSession();
  },
  bootstrapLoading(value: boolean) {
    loadingBootstrap = value;
    publishSession();
  },
  maintenance(value: boolean) {
    maintenance = value;
    publishSession();
  },
  bootstrapUnavailable(value: boolean) {
    bootstrapUnavailable = value;
    publishSession();
  },
};
declare global {
  interface Window {
    editorSessionTest: {
      counters: typeof counters;
      expire: () => void;
      holdSaves: () => void;
      releaseSaves: () => void;
      switchUser: (id: string, role?: Bootstrap['user']['role']) => void;
      bootstrapLoading: (value: boolean) => void;
      maintenance: (value: boolean) => void;
      bootstrapUnavailable: (value: boolean) => void;
    };
    editorSessionInitial?: { maintenance?: boolean; bootstrapUnavailable?: boolean };
  }
}
