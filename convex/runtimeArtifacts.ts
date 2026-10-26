import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { chromiumArchives, parseChromiumManifest } from '../src/printing/chromium-manifest';

// Deployment tooling only. Runtime resources never enter document or calendar data.
export const uploadUrl = internalMutation({
  args: {},
  returns: v.string(),
  handler: (ctx) => ctx.storage.generateUploadUrl(),
});

export const status = internalQuery({
  args: {},
  returns: v.object({ version: v.string(), ready: v.boolean() }),
  handler: async (ctx) => {
    const manifest = parseChromiumManifest(process.env.DENTEC_CHROMIUM_RUNTIME);
    for (const arch of ['x64', 'arm64'] as const)
      for (const name of chromiumArchives) {
        const archive = manifest.architectures[arch][name];
        const metadata = await ctx.db.system.get(archive.storageId as Id<'_storage'>);
        if (
          !metadata ||
          metadata.size !== archive.size ||
          metadata.sha256 !==
            btoa(
              String.fromCharCode(
                ...archive.sha256.match(/../g)!.map((pair) => Number.parseInt(pair, 16)),
              ),
            )
        )
          return { version: manifest.version, ready: false };
      }
    return { version: manifest.version, ready: true };
  },
});
