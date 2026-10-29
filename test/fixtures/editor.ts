import { convex } from '../../web/shared/convex/client.ts';
import { fixtureProfile, record } from './editor-client.ts';
import type { Bootstrap } from '../../web/shared/convex/types.ts';
import type { Id } from '../../convex/_generated/dataModel.js';
import { mountApplication } from './mount-application.ts';
import { editorUrl } from '../../src/app/routes.ts';
import '../../assets/printing/calendar.css';

if (location.pathname === '/__editor')
  history.replaceState(
    null,
    '',
    editorUrl(new URLSearchParams(location.search).get('id') || record.id) + location.hash,
  );
const info: Bootstrap = {
  user: {
    id: 'editor-user' as Id<'users'>,
    name: 'Pessoa de teste',
    email: 'editor@example.invalid',
    role: fixtureProfile.role,
    campusId: null,
    active: true,
    inviteExpiresAt: null,
    loginMethod: 'local',
  },
  campuses: [{ id: record.campusId, name: record.state.campus, archived: false }],
  users: [],
  calendars: [],
  catalogue: { revision: 1, events: [] },
};
mountApplication({
  client: convex,
  info,
  status: { setupRequired: false, hosted: true, googleEnabled: false, user: info.user },
});
