import { createClientErrorReporter } from '../client-errors.ts';
import { convex, functions } from './client.ts';

declare const __PORTAL_BUILD_ID__: string | undefined;

/** The build the page runs, so a record can be traced to the publication that produced it. */
export const portalRelease =
  typeof __PORTAL_BUILD_ID__ === 'string' && __PORTAL_BUILD_ID__ ? __PORTAL_BUILD_ID__ : 'dev';

export const reportClientError = createClientErrorReporter({
  send: (report) => convex.mutation(functions.clientErrors.report, report),
  route: () => window.location.pathname,
  release: portalRelease,
});
