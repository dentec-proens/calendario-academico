'use node';
import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import type { ActionCtx } from '../_generated/server';
import { ConvexError } from 'convex/values';

export function fail(message: string, status = 400): never {
  throw new ConvexError({ error: message, status });
}

export const validate = (bytes: Buffer) => {
  if (bytes.length < 5 || bytes.length > 8_000_000 || bytes.subarray(0, 5).toString() !== '%PDF-')
    fail('Envie um PDF de até 8 MB.');
  return bytes;
};

export const missingOriginal = () =>
  fail(
    'Este PDF original aguarda a transferência para o armazenamento atual. Seus dados e análises foram preservados.',
    503,
  );

export type FileSource = { storageId?: Id<'_storage'>; filename: string };

export async function original(ctx: ActionCtx, item: FileSource) {
  if (!item.storageId) return missingOriginal();
  const blob = await ctx.storage.get(item.storageId);
  if (!blob) return missingOriginal();
  return blob;
}

export async function fileBytes(ctx: ActionCtx, item: FileSource) {
  const blob = await original(ctx, item);
  if (blob.size < 5 || blob.size > 8_000_000) fail('Envie um PDF de até 8 MB.');
  return validate(Buffer.from(await blob.arrayBuffer()));
}

export async function downloadOriginal(ctx: ActionCtx, item: FileSource) {
  await original(ctx, item);
  return ctx.runMutation(internal.nativeFiles.ticket, {
    storageId: item.storageId!,
    filename: item.filename,
    ephemeral: false,
  });
}
