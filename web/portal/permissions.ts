import type { Bootstrap } from '../native/types.ts';

/** Presentation capabilities only. The backend authorizes every request independently. */
export function portalPermissions(role: Bootstrap['user']['role']) {
  const admin = role === 'ADMIN';
  return {
    selectCampus: admin,
    manageInstitution: admin,
    reviewCalendars: admin,
    manageCampuses: admin,
    manageAccounts: admin,
    viewOnlineUsers: admin,
  } as const;
}

export type PortalPermissions = ReturnType<typeof portalPermissions>;
