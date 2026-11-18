import type { Bootstrap } from '../shared/convex/types.ts';

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

/** Whether the person works on this campus's calendars; a campus account only reads the others. */
export function ownsCampus(user: Pick<Bootstrap['user'], 'role' | 'campusId'>, campusId: string) {
  return user.role !== 'CAMPUS' || user.campusId === campusId;
}
