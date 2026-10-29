import { record, convex as baseConvex } from './editor-client.ts';
export { functions } from './editor-client.ts';
record.state.events = [
  {
    id: 'local-event',
    name: 'Evento local salvo',
    start: '2027-03-10',
    end: '2027-03-10',
    kind: 'note',
    category: 'evento',
    offers: ['integrado'],
  },
  {
    id: 'activity-event',
    name: 'Semana Cultural salva',
    requirementId: 'cultural-week',
    start: '2027-10-04',
    end: '2027-10-08',
    kind: 'note',
    category: 'evento',
    offers: ['integrado'],
  },
];
export const convex = baseConvex;
