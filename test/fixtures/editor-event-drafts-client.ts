import { calendars as baseCalendars } from './editor-client.ts';
import type { HistoryAnalysis } from '../../web/editor-types.ts';
import type { Id } from '../../convex/_generated/dataModel.js';

export {
  accounts,
  subscribeCalendar,
  subscribeNativeConnection,
  downloadLink,
  nativeError,
  convex,
  functions,
} from './editor-client.ts';

const { record } = window.editorTest;
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
  calendarId: 'synthetic-calendar' as Id<'calendars'>,
  campusId: 'campus-a' as Id<'campuses'>,
  year: 2026,
  modalities: ['integrado'],
  hash: 'a'.repeat(64),
  filename: 'anterior.pdf',
  notes: '',
  createdAt: '2026-10-23T12:00:00Z',
  analyzed: true,
});
const analysis: HistoryAnalysis = {
  version: 1,
  pages: [{ page: 1, text: 'Feriado municipal e encontro da comunidade' }],
  candidates: ['Feriado municipal', 'Encontro da comunidade'].map((name) => ({
    name,
    page: 1,
    excerpt: name,
    likelyLocal: true,
    category: 'evento',
    dates: null,
  })),
  truncated: false,
  needsText: false,
  analyzedAt: '2026-10-23T12:00:00Z',
};
export const calendars = {
  ...baseCalendars,
  analyzeHistory: () => Promise.resolve(structuredClone(analysis)),
};
