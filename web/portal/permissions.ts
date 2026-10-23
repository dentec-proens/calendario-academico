import type { Bootstrap } from '../native/types.ts';

/** Presentation capabilities only. The backend authorizes every request independently. */
export function portalPermissions(role: Bootstrap['user']['role']) {
  const admin = role === 'ADMIN';
  return {
    selectCampus: role !== 'CAMPUS',
    editCalendars: role !== 'PARECERISTA',
    manageInstitution: admin,
    reviewCalendars: admin || role === 'PARECERISTA',
    manageCampuses: admin,
    manageAccounts: admin,
    viewOnlineUsers: admin,
  } as const;
}

export type PortalPermissions = ReturnType<typeof portalPermissions>;
