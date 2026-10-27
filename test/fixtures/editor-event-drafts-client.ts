import { record, convex as baseConvex } from './editor-client.ts';
import type { Id } from '../../convex/_generated/dataModel.js';
export { functions } from './editor-client.ts';
record.state.events = [
  {
    id: 'local-event',
    name: 'Evento local salvo',
    start: '2027-03-10',
    end: '2027-03-10',
    kind: 'note',
    category: 'evento',
    evidence: 'Ata salva',
    modalities: ['integrado'],
  },
  {
    id: 'activity-event',
    name: 'Semana Cultural salva',
    requirementId: 'cultural-week',
    start: '2027-10-04',
    end: '2027-10-08',
    kind: 'note',
    category: 'evento',
    evidence: 'Decisão salva',
    modalities: ['integrado'],
  },
];
record.histories.push({
  id: 'history-a' as Id<'histories'>,
  calendarId: record.id,
  campusId: record.campusId,
  year: 2026,
  modalities: ['integrado'],
  hash: 'a'.repeat(64),
  filename: 'anterior.pdf',
  notes: '',
  createdAt: '2026-10-23T12:00:00Z',
  analyzed: true,
});
export const convex = baseConvex;
