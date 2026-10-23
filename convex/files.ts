import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireBridge } from './bridge';

function checkPath(path: string) {
  if (!/^(uploads|exports)\/[\w-]+\.pdf$/.test(path)) throw Error('Invalid file path.');
}

export const uploadUrl = mutation({
  args: { secret: v.string() },
  returns: v.string(),
  handler: async (ctx, { secret }) => {
    requireBridge(secret);
    return await ctx.storage.generateUploadUrl();
  },
});

export const register = mutation({
  args: { secret: v.string(), path: v.string(), storageId: v.id('_storage') },
  returns: v.boolean(),
  handler: async (ctx, { secret, path, storageId }) => {
    requireBridge(secret);
    checkPath(path);
    const metadata = await ctx.db.system.get('_storage', storageId);
    if (
      !metadata ||
      metadata.size < 5 ||
      metadata.size > 8_000_000 ||
      metadata.contentType !== 'application/pdf'
    )
      throw Error('Invalid PDF metadata.');
    const existing = await ctx.db
      .query('fileObjects')
      .withIndex('by_path', (q) => q.eq('path', path))
      .unique();
    if (existing) return false;
    const attached = await ctx.db
      .query('fileObjects')
      .withIndex('by_storageId', (q) => q.eq('storageId', storageId))
      .unique();
    if (attached) throw Error('File is already registered.');
    await ctx.db.insert('fileObjects', { path, storageId });
    return true;
  },
});

export const downloadUrl = query({
  args: { secret: v.string(), path: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { secret, path }) => {
    requireBridge(secret);
    checkPath(path);
    const file = await ctx.db
      .query('fileObjects')
      .withIndex('by_path', (q) => q.eq('path', path))
      .unique();
    return file ? await ctx.storage.getUrl(file.storageId) : null;
  },
});

export const discard = mutation({
  args: { secret: v.string(), storageId: v.id('_storage') },
  returns: v.null(),
  handler: async (ctx, { secret, storageId }) => {
    requireBridge(secret);
    const attached = await ctx.db
      .query('fileObjects')
      .withIndex('by_storageId', (q) => q.eq('storageId', storageId))
      .unique();
    if (!attached) await ctx.storage.delete(storageId);
    return null;
  },
});
