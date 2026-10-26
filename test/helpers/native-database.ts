import { convexModules } from './convex-modules.ts';
import { convexTest } from 'convex-test';
import type { FunctionReference } from 'convex/server';
import type { Id } from '../../convex/_generated/dataModel.js';
import { api, internal } from '../../convex/_generated/api.js';
import schema from '../../convex/schema';

export const userFixtures = [
  {
    id: 'admin',
    name: 'Admin',
    email: 'admin@ifpr.edu.br',
    role: 'ADMIN',
    campusId: null,
    active: true,
  },
  {
    id: 'campus-a',
    name: 'Campus A',
    email: 'a@ifpr.edu.br',
    role: 'CAMPUS',
    campusId: 'a',
    active: true,
  },
  {
    id: 'campus-b',
    name: 'Campus B',
    email: 'b@ifpr.edu.br',
    role: 'CAMPUS',
    campusId: 'b',
    active: true,
  },
] as const;

type Entity = Record<string, unknown>;
type DocumentSeed = {
  id: string;
  year: number;
  type: 'norma' | 'referencia' | 'parecer';
  title: string;
  status: 'rascunho' | 'vigente' | 'arquivado';
  source?: string;
  filename?: string;
  hash?: string;
  objectKey?: string;
  version?: number;
  createdAt?: string | number;
  publishedAt?: string | number;
};
type Seed = {
  catalogue?: { revision: number; events: Array<Entity> };
  documents?: Array<DocumentSeed>;
};
const iso = (value: number) => new Date(value).toISOString();
const time = (value: unknown) =>
  typeof value === 'string' ? Date.parse(value) : typeof value === 'number' ? value : Date.now();

// These fixtures use real Convex tables and transactions. Synthetic names are
// resolved only here; the production client and backend use native document IDs.
export async function createNativeFixture(overrides: Seed = {}) {
  const client = convexTest(schema, convexModules);
  const ids = {
    campuses: {} as Record<string, Id<'campuses'>>,
    users: {} as Record<string, Id<'users'>>,
    documents: {} as Record<string, Id<'documents'>>,
    events: {} as Record<string, Id<'institutionalEvents'>>,
  };
  await client.run(async (ctx) => {
    for (const name of ['a', 'b'])
      ids.campuses[name] = await ctx.db.insert('campuses', {
        name: name.toUpperCase(),
        archived: false,
      });
    for (const user of userFixtures)
      ids.users[user.id] = await ctx.db.insert('users', {
        name: user.name,
        email: user.email,
        role: user.role,
        ...(user.campusId ? { campusId: ids.campuses[user.campusId] } : {}),
        active: true,
        loginMethod: 'local',
        ...(user.role === 'ADMIN'
          ? { nativeInviteHash: 'private-invite-hash', nativeResetHash: 'private-reset-hash' }
          : {}),
      });
    const revision = overrides.catalogue?.revision ?? 1;
    await ctx.db.insert('institutionSettings', { key: 'catalogue', revision });
    const years = new Set([2027]);
    for (const event of overrides.catalogue?.events ?? []) {
      const year = Number(String(event.start).slice(0, 4));
      years.add(year);
      const code = String(event.id);
      ids.events[code] = await ctx.db.insert('institutionalEvents', {
        code,
        year,
        name: String(event.name),
        start: String(event.start),
        end: String(event.end),
        kind: event.kind as 'include' | 'exclude' | 'note',
        category: String(event.category),
        evidence: String(event.evidence),
        modalities: (event.modalities ?? event.offers) as Array<
          'integrado' | 'subsequente' | 'graduacao'
        >,
        active: event.active !== false,
      });
    }
    for (const document of overrides.documents ?? []) {
      years.add(Number(document.year));
      ids.documents[String(document.id)] = await ctx.db.insert('documents', {
        year: Number(document.year),
        type: document.type as 'norma' | 'referencia' | 'parecer',
        title: String(document.title),
        source: String(document.source ?? 'Fonte sintética'),
        filename: String(document.filename ?? document.id + '.pdf'),
        hash: String(document.hash ?? '0'.repeat(64)),
        unavailableFile: {
          sourceReference: String(document.objectKey ?? document.id),
          reason: 'not_migrated',
        },
        status: document.status as 'rascunho' | 'vigente' | 'arquivado',
        version: Number(document.version ?? 1),
        createdAt: time(document.createdAt),
        ...(document.publishedAt ? { publishedAt: time(document.publishedAt) } : {}),
      });
    }
    for (const year of years) await ctx.db.insert('catalogueRevisions', { year, revision });
  });
  const accounts: Record<string, ReturnType<typeof client.withIdentity>> = {};
  for (const user of userFixtures) {
    const identity = await client.run(async (ctx) => {
      const userId = ids.users[user.id];
      const sessionId = await ctx.db.insert('authSessions', {
        userId,
        expirationTime: Date.now() + 3_600_000,
      });
      return { subject: `${userId}|${sessionId}` };
    });
    accounts[user.id] = client.withIdentity(identity);
  }
  const asClient = (id: string) => {
    const account = accounts[id];
    if (!account) throw new Error('Unknown synthetic fixture user.');
    return account;
  };
  const as = (id: string) => {
    const account = asClient(id);
    const query = (reference: FunctionReference<'query', 'public' | 'internal'>, args: Entity) =>
      account.query(reference, args);
    const mutation = (
      reference: FunctionReference<'mutation', 'public' | 'internal'>,
      args: Entity,
    ) => account.mutation(reference, args);
    const calendarId = (value: string) => value as Id<'calendars'>;
    const documentId = (value: string) => ids.documents[value] ?? (value as Id<'documents'>);
    // The dispatchers are test-only conveniences for the existing behavioral
    // scenarios. Each invocation reaches a concrete, validated Convex function.
    return {
      read: async (path: string): Promise<any> => {
        if (path === '/api/bootstrap') return query(api.workspace.bootstrap, {});
        if (path === '/api/status') return query(api.access.session.status, {});
        if (path === '/api/documents') return query(api.documents.documents, {});
        if (path === '/api/calendar-trash') return query(api.calendars.trash, {});
        if (path.startsWith('/api/logs'))
          return query(api.workspace.logs, { paginationOpts: { numItems: 50, cursor: null } });
        const match = path.match(/^\/api\/(calendars|reviews)\/([^/]+)$/);
        if (match)
          return query(match[1] === 'calendars' ? api.calendars.calendar : api.reviews.review, {
            id: calendarId(match[2]),
          });
        throw new Error('Unknown fixture query: ' + path);
      },
      write: async (path: string, body: Entity = {}, method = 'POST'): Promise<any> => {
        if (path === '/api/calendars')
          return mutation(api.calendars.createCalendar, {
            body: { ...body, campusId: ids.campuses[String(body.campusId)] ?? body.campusId },
          });
        if (path === '/api/catalogue') return mutation(api.catalogue.saveCatalogue, { body });
        if (path === '/api/campuses')
          return mutation(api.campuses.createCampus, { name: body.name });
        const document = path.match(/^\/api\/documents\/([^/]+)\/status$/);
        if (document)
          return mutation(api.documents.documentStatus, { id: documentId(document[1]), ...body });
        const review = path.match(/^\/api\/reviews\/([^/]+)(\/export)?$/);
        if (review)
          return review[2]
            ? query(api.reviews.exportReview, {
                id: calendarId(review[1]),
                revision: body.revision,
              })
            : mutation(api.reviews.saveReview, { id: calendarId(review[1]), body });
        const calendar = path.match(/^\/api\/calendars\/([^/]+)(?:\/(restore|make-definitive))?$/);
        if (calendar) {
          const id = calendarId(calendar[1]);
          if (calendar[2] === 'restore') return mutation(api.calendars.restoreCalendar, { id });
          if (calendar[2] === 'make-definitive')
            return mutation(api.calendars.makeDefinitive, { id, version: body.version });
          if (method === 'DELETE')
            return mutation(api.calendars.deleteCalendar, { id, version: body.version });
          return mutation(api.calendars.saveCalendar, { id, body });
        }
        throw new Error('Unknown fixture mutation: ' + path);
      },
      actionContext: async (path: string, body: Entity = {}): Promise<any> => {
        const calendar = path.match(/^\/api\/calendars\/([^/]+)\/pdf$/);
        if (calendar)
          return query(internal.calendars.pdfContext, { id: calendarId(calendar[1]), ...body });
        const history = path.match(/^\/api\/history\/([^/]+)(?:\/analysis)?$/);
        if (history) return query(internal.histories.historyContext, { id: history[1] });
        const document = path.match(/^\/api\/documents\/([^/]+)$/);
        if (document)
          return query(internal.documents.documentContext, { id: documentId(document[1]) });
        throw new Error('Unknown fixture action context: ' + path);
      },
      finishAction: async (path: string, body: Entity, result: Entity): Promise<any> => {
        const history = path.match(/^\/api\/calendars\/([^/]+)\/history$/);
        if (history)
          return mutation(internal.histories.attachHistory, {
            calendarId: calendarId(history[1]),
            ...body,
            uploadId: result.uploadId,
          });
        if (path === '/api/documents')
          return mutation(internal.documents.attachDocument, {
            ...body,
            uploadId: result.uploadId,
          });
        const analysis = path.match(/^\/api\/history\/([^/]+)\/analysis$/);
        if (analysis)
          return mutation(internal.histories.saveHistoryAnalysis, {
            id: analysis[1],
            hash: body.hash,
            analysis: result,
          });
        throw new Error('Unknown fixture action completion: ' + path);
      },
    };
  };
  const inspect = () =>
    client.run(async (ctx) => {
      const [
        calendars,
        contents,
        snapshots,
        versions,
        reviews,
        reviewVersions,
        histories,
        analyses,
        events,
        settings,
        documents,
        audit,
      ] = await Promise.all([
        ctx.db.query('calendars').collect(),
        ctx.db.query('calendarContents').collect(),
        ctx.db.query('calendarSnapshots').collect(),
        ctx.db.query('calendarVersions').collect(),
        ctx.db.query('reviews').collect(),
        ctx.db.query('reviewVersions').collect(),
        ctx.db.query('histories').collect(),
        ctx.db.query('historyAnalyses').collect(),
        ctx.db.query('institutionalEvents').collect(),
        ctx.db.query('institutionSettings').first(),
        ctx.db.query('documents').collect(),
        ctx.db.query('audit').collect(),
      ]);
      return {
        calendars: calendars.map((calendar) => {
          const content = contents.find((item) => item.calendarId === calendar._id)!;
          return {
            ...calendar,
            id: calendar._id,
            state: {
              ...content.state,
              schemaVersion: content.state.schemaVersion ?? 2,
              year: calendar.year,
              campus: calendar.campusId === ids.campuses.a ? 'A' : 'B',
              modalities: calendar.modalities,
              offer: calendar.modalities[0],
            },
            versions: versions
              .filter((version) => version.calendarId === calendar._id)
              .sort((a, b) => a.version - b.version)
              .map((version) => ({
                ...snapshots.find((snapshot) => snapshot._id === version.snapshotId)!,
                version: version.version,
              })),
          };
        }),
        reviews: reviews.map((review) => ({
          ...review,
          id: review._id,
          history: reviewVersions
            .filter((version) => version.reviewId === review._id)
            .sort((a, b) => a.revision - b.revision),
        })),
        histories: histories.map((history) => ({
          ...history,
          id: history._id,
          ...(analyses.find((item) => item.historyId === history._id)
            ? { analysis: analyses.find((item) => item.historyId === history._id)!.analysis }
            : {}),
        })),
        catalogue: {
          revision: settings?.revision ?? 1,
          events: events.map((event) => ({
            ...event,
            id: event.code,
            modalities: event.modalities,
          })),
        },
        documents: documents.map((document) => ({ ...document, id: document._id })),
        audit: audit.map((entry) => ({ ...entry, at: iso(entry.at) })),
      };
    });
  return { client, as, asClient, inspect, ids };
}
