import { calendars, accounts as baseAccounts } from './editor-event-drafts-client.ts';
export { calendars };
export {
  subscribeNativeConnection,
  downloadLink,
  nativeError,
  convex,
  functions,
} from './editor-event-drafts-client.ts';

export const accounts = {
  ...baseAccounts,
  status: () => Promise.resolve({ user: { role: 'PARECERISTA' } }),
};

export function subscribeCalendar(_id: string, onValue: (value: unknown) => void) {
  window.publishReviewerCalendar = async () => onValue(await calendars.get());
  return () => {};
}

declare global {
  interface Window {
    publishReviewerCalendar: () => Promise<void>;
  }
}
