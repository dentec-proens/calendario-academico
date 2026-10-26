import { record, convex as baseConvex } from './editor-client.ts';
import type { HistoryAnalysis } from '../../web/features/calendar-editor/types.ts';
import type { Id } from '../../convex/_generated/dataModel.js';
import { getFunctionName, type FunctionReference } from 'convex/server';
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
const analysis: HistoryAnalysis = {
  version: 1,
  analysisId: 'analysis-a' as Id<'historyAnalyses'>,
  extractorVersion: 3,
  documentYear: 2026,
  pdfHash: 'a'.repeat(64),
  pages: [{ page: 1, text: 'Feriado municipal e encontro da comunidade' }],
  candidates: ['Feriado municipal', 'Encontro da comunidade'].map((name, index) => ({
    name,
    page: 1,
    excerpt: name,
    likelyLocal: true,
    category: 'evento',
    dates:
      index === 0
        ? {
            name,
            startMonth: 5,
            startDay: 1,
            endMonth: 5,
            endDay: 1,
            sourceYear: 2026,
            endYear: 2026,
            headerYear: 2026,
            yearSource: 'line',
            conflict: false,
          }
        : null,
  })),
  truncated: false,
  needsText: false,
  analyzedAt: '2026-10-23T12:00:00Z',
};
window.editorHistoryTest = { analysis };
declare global {
  interface Window {
    editorHistoryTest: { analysis: HistoryAnalysis };
  }
}
export const convex = {
  ...baseConvex,
  action(reference: FunctionReference<'action'>, args: Record<string, unknown>) {
    if (getFunctionName(reference) === 'actions/history:analyzeHistory')
      return Promise.resolve(structuredClone(analysis));
    return baseConvex.action(reference, args);
  },
};
