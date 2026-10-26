import { useSyncExternalStore } from 'react';
import { getFunctionName, type FunctionReference } from 'convex/server';
import { convex as reviewClient, info } from './review-ui-client.ts';
import type { Status } from '../../web/shared/convex/types.ts';
import type { Id } from '../../convex/_generated/dataModel.js';
export { functions } from './review-ui-client.ts';

info.user.role = 'ADMIN';
info.campuses.push({
  id: 'other-campus' as Id<'campuses'>,
  name: 'Outro campus para filtro',
  archived: false,
});
const subscribers = new Set<() => void>();
let authenticated = true;
let authLoading = false;
let bootstrapLoading = false;
function publish() {
  subscribers.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}
const fetchAccessToken = () => Promise.resolve(authenticated ? 'synthetic-token' : null);
export function useFixtureAuth() {
  const isAuthenticated = useSyncExternalStore(subscribe, () => authenticated);
  const isLoading = useSyncExternalStore(subscribe, () => authLoading);
  return { isAuthenticated, isLoading, fetchAccessToken };
}
export const actions = {
  signOut: () => {
    authenticated = false;
    publish();
    return Promise.resolve();
  },
  signIn: () => {
    authenticated = true;
    publish();
    return Promise.resolve();
  },
};
function sessionResult(name: string) {
  if (name === 'workspace:bootstrap') return bootstrapLoading ? undefined : structuredClone(info);
  return {
    setupRequired: false,
    hosted: true,
    googleEnabled: false,
    user: authenticated || authLoading ? info.user : null,
  } satisfies Status;
}
export const convex = {
  ...reviewClient,
  setAuth(_fetch: unknown, callback: (isAuthenticated: boolean) => void) {
    queueMicrotask(() => callback(authenticated));
  },
  clearAuth() {},
  watchQuery(reference: FunctionReference<'query'>, args: { campusId?: string }) {
    const name = getFunctionName(reference);
    if (name === 'workspace:bootstrap' || name === 'access/session:status') {
      let cached = sessionResult(name);
      return {
        localQueryResult: () => cached,
        journal: () => undefined,
        onUpdate(callback: () => void) {
          return subscribe(() => {
            cached = sessionResult(name);
            callback();
          });
        },
      };
    }
    if (name === 'operations:availability')
      return {
        localQueryResult: () => availability,
        journal: () => undefined,
        onUpdate: () => () => {},
      };
    const watched = reviewClient.watchQuery(reference);
    if (name !== 'calendars:calendarPage' || args.campusId !== 'other-campus') return watched;
    return {
      ...watched,
      localQueryResult: () => emptyPage,
    };
  },
};
const availability = { maintenance: false };
const emptyPage = { page: [], isDone: true, continueCursor: '' };
window.reviewSessionTest = {
  bootstrapLoading(value: boolean) {
    bootstrapLoading = value;
    publish();
  },
  authenticationLoading(value: boolean) {
    authLoading = value;
    authenticated = !value;
    bootstrapLoading = value;
    publish();
  },
};
declare global {
  interface Window {
    reviewSessionTest: {
      bootstrapLoading: (value: boolean) => void;
      authenticationLoading: (value: boolean) => void;
    };
  }
}
