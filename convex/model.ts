export const entityTables = [
  'users',
  'campuses',
  'calendars',
  'histories',
  'audit',
  'sessions',
  'loginAttempts',
  'invitations',
  'passwordResets',
  'recoveryAttempts',
  'uploads',
  'documents',
  'reviews',
] as const;

export type EntityTable = (typeof entityTables)[number];

export function isEntityTable(field: string): field is EntityTable {
  return (entityTables as readonly string[]).includes(field);
}

export const identityFields: Partial<Record<EntityTable, string>> = {
  users: 'id',
  campuses: 'id',
  calendars: 'id',
  histories: 'id',
  sessions: 'id',
  loginAttempts: 'id',
  invitations: 'tokenHash',
  passwordResets: 'hash',
  recoveryAttempts: 'key',
  uploads: 'id',
  documents: 'id',
  reviews: 'calendarId',
};

export function scopeKey(field: string, options: Record<string, any>) {
  if (!options.full && ['calendars', 'histories', 'reviews'].includes(field)) {
    if (options.calendarId) return `${field}:calendar:${options.calendarId}`;
    if (options.campusId && field !== 'reviews') return `${field}:campus:${options.campusId}`;
  }
  if (field === 'sessions' && options.sessionHash) return `${field}:id:${options.sessionHash}`;
  if (field === 'users') {
    if (options.userId) return `${field}:id:${options.userId}`;
    if (options.email) return `${field}:email:${options.email}`;
  }
  return `${field}:all`;
}

export function affectedScopes(field: string, value: Record<string, any>) {
  const keys = [`${field}:all`];
  if (value.id) keys.push(`${field}:id:${value.id}`);
  if (value.email) keys.push(`${field}:email:${value.email}`);
  if (['calendars', 'histories', 'reviews'].includes(field)) {
    const calendarId = field === 'calendars' ? value.id : value.calendarId;
    if (calendarId) keys.push(`${field}:calendar:${calendarId}`);
    if (value.campusId && field !== 'reviews') keys.push(`${field}:campus:${value.campusId}`);
  }
  return keys;
}
