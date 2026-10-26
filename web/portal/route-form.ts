import { portalCreationPaths, portalPaths, type PortalPageId } from '../../src/app-routes.ts';
import { getAppRouter, navigateApp, useAppLocation } from '../routing.tsx';

/** Form fields stay mounted; the URL determines which view is visible. */
export function useRouteForm(page: PortalPageId) {
  const { pathname, searchStr } = useAppLocation();
  const creating = pathname === portalCreationPaths[page];
  const setCreating = (open: boolean) => {
    if (!open && getAppRouter().latestLocation.pathname !== portalCreationPaths[page]) return;
    void navigateApp(((open && portalCreationPaths[page]) || portalPaths[page]) + searchStr);
  };
  return [creating, setCreating] as const;
}
