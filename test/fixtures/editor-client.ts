import type { CalendarState } from '../../web/editor-types.ts';
import { teacherDayId } from '../../src/teacher-day.ts';

const state: CalendarState = {
  schemaVersion: 2,
  campus: 'Campus de teste',
  year: 2027,
  offer: 'integrado',
  modalities: ['integrado'],
  regime: 'anual',
  weekdays: [1, 2, 3, 4, 5],
  weekEvidence: 'Ata sintética',
  weekConfirmed: true,
  periods: [],
  events: [],
  ignoredHistory: [],
  assessmentStagesByModality: {},
};
const record = {
  id: 'synthetic-calendar',
  name: '2027 — Campus de teste',
  state,
  purpose: 'test',
  courses: 'Curso sintético',
  classes: '',
  shifts: '',
  version: 1,
  catalogueRevision: 1,
  currentCatalogueRevision: 1,
  updatedAt: '2026-10-23T12:00:00Z',
  institutionalEvents: [
    {
      id: teacherDayId,
      name: 'Dia do Professor',
      start: '2027-10-15',
      end: '2027-10-15',
      kind: 'exclude',
      evidence: 'Base sintética',
      institutional: true,
    },
  ],
  histories: [],
  readiness: { ready: false, issues: [], warnings: [] },
};
const calls = { saves: 0, conversions: 0, failConversion: false };
export const calendars = {
  get: () => Promise.resolve(structuredClone(record)),
  save: (_id: string, body: { state: CalendarState }) => {
    calls.saves++;
    record.state = structuredClone(body.state);
    record.version++;
    return Promise.resolve(structuredClone(record));
  },
  makeDefinitive: () => {
    calls.conversions++;
    if (calls.failConversion) return Promise.reject(new Error('Falha sintética ao converter.'));
    record.purpose = 'definitive';
    return Promise.resolve(structuredClone(record));
  },
};
export const accounts = { status: () => Promise.resolve({ user: { role: 'ADMIN' } }) };
export const subscribeCalendar = () => () => {};
export const subscribeNativeConnection = () => () => {};
export const downloadLink = () => Promise.resolve();
export const nativeError = (cause: unknown) =>
  cause instanceof Error ? cause : new Error('Falha sintética.');
export const convex = {};
export const functions = {};

window.editorTest = { record, calls };

declare global {
  interface Window {
    editorTest: { record: typeof record; calls: typeof calls };
  }
}
