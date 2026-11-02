import { civilDate } from '../../src/domain/civil-date.ts';
import { record, convex as baseConvex } from './editor-client.ts';
export { functions } from './editor-client.ts';
record.state.events = [
  {
    id: 'local-event',
    name: 'Evento local salvo',
    start: civilDate('2027-03-10'),
    end: civilDate('2027-03-10'),
    effect: 'note',
    category: 'evento',
    offers: ['integrado'],
  },
  {
    id: 'activity-event',
    name: 'Semana Cultural salva',
    requirementId: 'cultural-week',
    start: civilDate('2027-10-04'),
    end: civilDate('2027-10-08'),
    effect: 'note',
    category: 'evento',
    offers: ['integrado'],
  },
];
export const convex = baseConvex;
