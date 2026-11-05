import { createClientErrorReporter } from '../client-errors.ts';
import { convex, functions } from './client.ts';

declare const __PORTAL_BUILD_ID__: string | undefined;

export const reportClientError = createClientErrorReporter({
  send: (report) => convex.mutation(functions.clientErrors.report, report),
  route: () => window.location.pathname,
  release:
    typeof __PORTAL_BUILD_ID__ === 'string' && __PORTAL_BUILD_ID__ ? __PORTAL_BUILD_ID__ : 'dev',
});
