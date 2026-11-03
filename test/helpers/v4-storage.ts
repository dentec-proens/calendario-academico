import type { Doc, Id } from '../../convex/_generated/dataModel';
import type { MutationCtx } from '../../convex/_generated/server';

type Json = Record<string, unknown>;
type CalendarFields = Partial<Omit<Doc<'calendars'>, '_id' | '_creationTime'>>;

/**
 * Binds the synthetic IDs of the frozen v4 documents (`test/fixtures/v4/`) to real rows, as the
 * stored documents had: one calendar per synthetic calendar ID (2027 draft of campus `campusId`
 * unless `calendar` says otherwise on its first use), one `documents` row per document and one
 * Storage file per `storageId`. Authors become `userId`.
 */
export async function bindIds(ctx: MutationCtx, campusId: Id<'campuses'>, userId: Id<'users'>) {
  const calendars = new Map<string, Id<'calendars'>>();
  const documents = new Map<string, Id<'documents'>>();
  const storage = new Map<string, Id<'_storage'>>();
  const calendar = async (id: string, fields: CalendarFields) => {
    if (!calendars.has(id))
      calendars.set(
        id,
        await ctx.db.insert('calendars', {
          campusId,
          year: 2027,
          offerKinds: ['integrado'],
          status: 'rascunho',
          statusRevision: 0,
          courses: '',
          classes: '',
          shifts: '',
          version: 1,
          updatedAt: 0,
          ...fields,
        }),
      );
    return calendars.get(id)!;
  };
  const file = async (id: string) => {
    if (!storage.has(id)) storage.set(id, await ctx.storage.store(new Blob([id])));
    return storage.get(id)!;
  };
  const document = async (item: Json) => {
    const id = String(item.id);
    if (!documents.has(id)) {
      const { id: _id, ...fields } = item;
      documents.set(
        id,
        await ctx.db.insert('documents', {
          ...(fields as Omit<Json, 'id'>),
          storageId: undefined,
          createdBy: undefined,
          publishedBy: undefined,
        } as never),
      );
    }
    return documents.get(id)!;
  };
  return async <T extends { calendarId: string; documentSnapshot: Json[] }>(
    value: T,
    fields: CalendarFields = {},
  ) => ({
    ...value,
    calendarId: await calendar(value.calendarId, fields),
    documentSnapshot: await Promise.all(
      value.documentSnapshot.map(async (item) => ({
        ...item,
        id: await document(item),
        ...(typeof item.storageId === 'string' ? { storageId: await file(item.storageId) } : {}),
        ...(item.createdBy ? { createdBy: userId } : {}),
        ...(item.publishedBy ? { publishedBy: userId } : {}),
      })),
    ),
    ...('submittedBy' in value
      ? { submittedBy: { ...(value.submittedBy as Json), id: userId } }
      : {}),
  });
}
