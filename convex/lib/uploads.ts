import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { fail, text } from './shared';

export async function consumeUpload(
  ctx: MutationCtx,
  userId: Id<'users'>,
  uploadId: string,
  filename: string,
) {
  const upload = await ctx.db
    .query('nativeUploads')
    .withIndex('by_uploadId', (q) => q.eq('uploadId', uploadId))
    .unique();
  if (
    !upload ||
    upload.ownerId !== userId ||
    upload.expiresAt <= Date.now() ||
    !upload.completedAt ||
    upload.consumedAt ||
    !upload.storageId ||
    !upload.hash ||
    upload.filename !== filename
  )
    fail('Envio expirado, já utilizado ou incompatível.', 409);
  if (!filename.toLowerCase().endsWith('.pdf')) fail('Envie um PDF.');
  const document = await ctx.db
    .query('documents')
    .withIndex('by_storageId', (q) => q.eq('storageId', upload.storageId))
    .first();
  if (document) fail('Arquivo já cadastrado.', 409);
  await ctx.db.patch(upload._id, { consumedAt: Date.now() });
  return {
    storageId: upload.storageId,
    hash: upload.hash,
    filename: text(filename, 180),
    size: upload.size,
  };
}
