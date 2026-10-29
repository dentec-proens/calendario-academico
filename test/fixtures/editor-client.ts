import type { CalendarRecord, CalendarState } from '../../web/features/calendar-editor/types.ts';
import type { Bootstrap } from '../../web/shared/convex/types.ts';
import type { Id } from '../../convex/_generated/dataModel.js';
import { api } from '../../convex/_generated/api.js';
import { getFunctionName, type FunctionReference } from 'convex/server';
import { teacherDayId } from '../../src/domain/institution/teacher-day.ts';
import { kinds } from '../../src/domain/calendar/offers.ts';
import { rulesetVersion } from '../../src/domain/policies/registry.ts';

export const record: CalendarRecord = {
  id: 'synthetic-calendar' as Id<'calendars'>,
  campusId: 'campus-a' as Id<'campuses'>,
  name: '2027 — Campus de teste',
  year: 2027,
  offerKinds: ['integrado'],
  state: {
    schemaVersion: 4,
    offers: [{ id: 'integrado', kind: 'integrado', delivery: 'a-conferir', organization: 'anual' }],
    campus: 'Campus de teste',
    year: 2027,
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [],
    events: [],
  },
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
  documentSnapshot: [],
  institutionalSnapshot: [],
  versions: [],
  currentDocuments: [],
  readiness: { ready: false, issues: [], warnings: [], officialApproval: false },
};
record.state.rulesetVersion = rulesetVersion(record.state);
record.institutionalSnapshot = structuredClone(record.institutionalEvents);
export const calls = { synchronizations: 0, saves: 0, conversions: 0, failConversion: false };
export const fixtureProfile: { role: Bootstrap['user']['role'] } = { role: 'ADMIN' };
export const functions = api;
const listeners = new Set<() => void>();
const connection = {
  isWebSocketConnected: true,
  hasEverConnected: true,
  timeOfOldestInflightRequest: null,
  hasInflightRequests: false,
  inflightMutations: 0,
  inflightActions: 0,
};
export function publish() {
  for (const listener of listeners) listener();
}
function result(name: string) {
  switch (name) {
    case 'calendars:calendar':
      return structuredClone(record);
    case 'calendars:calendarPage':
      return { page: [record], isDone: true, continueCursor: '' };
    case 'operations:availability':
      return { maintenance: false };
    case 'presence:online':
      return [];
    default:
      return { page: [], isDone: true, continueCursor: '' };
  }
}
export const convex = {
  url: 'http://127.0.0.1',
  connectionState: () => connection,
  subscribeToConnectionState: () => () => {},
  watchQuery(reference: FunctionReference<'query'>) {
    const name = getFunctionName(reference);
    let cached = result(name);
    return {
      localQueryResult: () => cached,
      journal: () => undefined,
      onUpdate(callback: () => void) {
        const listener = () => {
          cached = result(name);
          callback();
        };
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
  },
  query: (reference: FunctionReference<'query'>) =>
    Promise.resolve(result(getFunctionName(reference))),
  mutation(reference: FunctionReference<'mutation'>, args: Record<string, unknown>) {
    switch (getFunctionName(reference)) {
      case 'calendars:synchronizeBase': {
        calls.synchronizations++;
        record.catalogueRevision = record.currentCatalogueRevision;
        publish();
        return Promise.resolve(structuredClone(record));
      }
      case 'calendars:saveCalendar': {
        const body = args.body as { state: CalendarState; version: number };
        if (body.version !== record.version)
          return Promise.reject(
            Object.assign(new Error('Há versão mais recente. Reabra o calendário.'), {
              status: 409,
            }),
          );
        calls.saves++;
        record.state = structuredClone(body.state);
        record.offerKinds = kinds(body.state);
        record.version++;
        record.catalogueRevision = record.currentCatalogueRevision;
        record.institutionalSnapshot = structuredClone(record.institutionalEvents);
        record.documentSnapshot = structuredClone(record.currentDocuments);
        publish();
        return Promise.resolve({
          base: {
            revision: record.catalogueRevision,
            events: record.institutionalSnapshot,
            documents: record.documentSnapshot,
          },
          state: structuredClone(record.state),
          version: record.version,
          updatedAt: record.updatedAt,
          readiness: record.readiness,
        });
      }
      case 'calendars:makeDefinitive':
        calls.conversions++;
        if (calls.failConversion) return Promise.reject(new Error('Falha sintética ao converter.'));
        record.purpose = 'definitive';
        record.version++;
        publish();
        return Promise.resolve({
          purpose: record.purpose,
          version: record.version,
          updatedAt: record.updatedAt,
          readiness: record.readiness,
        });
      default:
        return Promise.reject(
          new Error(`Mutação sintética não implementada: ${getFunctionName(reference)}`),
        );
    }
  },
  action(reference: FunctionReference<'action'>, _args: Record<string, unknown>): Promise<unknown> {
    return Promise.reject(
      new Error(`Action sintética não implementada: ${getFunctionName(reference)}`),
    );
  },
};
window.editorTest = { record, calls };
window.publishReviewerCalendar = () => {
  publish();
  return Promise.resolve();
};
declare global {
  interface Window {
    editorTest: { record: typeof record; calls: typeof calls };
    publishReviewerCalendar: () => Promise<void>;
  }
}
