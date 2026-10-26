import { mountApplication } from './mount-application.ts';
import type { Bootstrap } from '../../web/shared/convex/types.ts';
import type { Id } from '../../convex/_generated/dataModel.js';

history.replaceState(null, '', '/usuarios-online' + location.search);
const subscribers = new Set<() => void>();
let result: unknown;
const connection = {
  isWebSocketConnected: true,
  hasEverConnected: true,
  timeOfOldestInflightRequest: null,
  hasInflightRequests: false,
  inflightMutations: 0,
  inflightActions: 0,
};
const client = {
  connectionState: () => connection,
  subscribeToConnectionState: () => () => {},
  watchQuery: () => ({
    onUpdate: (callback: () => void) => {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
    localQueryResult: () => result,
    journal: () => undefined,
  }),
};
window.setOnlineFixture = (value: unknown) => {
  result = value;
  subscribers.forEach((callback) => callback());
};
const user: Bootstrap['user'] = {
  id: 'admin' as Id<'users'>,
  name: 'Pessoa de teste',
  email: 'teste@example.invalid',
  role: 'ADMIN',
  campusId: null,
  active: true,
  inviteExpiresAt: null,
  loginMethod: 'local',
};
mountApplication({
  client,
  info: { user, campuses: [], calendars: [], users: [], catalogue: { revision: 1, events: [] } },
  status: { user, hosted: true, setupRequired: false, googleEnabled: false },
});

declare global {
  interface Window {
    setOnlineFixture: (value: unknown) => void;
  }
}
