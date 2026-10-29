'use node';
import { withActionLease } from '../lib/maintenance';
import { nativePdf } from '../../src/runtime/pdf/native-pdf';
import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { chromiumArchives, parseChromiumManifest } from '../../src/runtime/pdf/chromium-manifest';
import { action } from '../_generated/server';
import { pdfRequest, fileDownload } from '../validators';
import type { Infer } from 'convex/values';

export const generatePdf = action({
  args: pdfRequest.fields,
  returns: fileDownload,
  handler: async (ctx, args): Promise<Infer<typeof fileDownload>> =>
    withActionLease(ctx, 'actions.pdf.generatePdf', async () => {
      const context = await ctx.runQuery(internal.calendars.pdfContext, args);
      const record = {
        ...context.record,
        proposalCopy: context.proposalCopy,
        readiness: context.readiness,
        currentCatalogueRevision: context.currentCatalogueRevision,
      };
      const manifest = parseChromiumManifest(process.env.DENTEC_CHROMIUM_RUNTIME);
      if (process.arch !== 'x64' && process.arch !== 'arm64')
        throw Error('Arquitetura PDF não suportada.');
      const arch = process.arch;
      const archives = await Promise.all(
        chromiumArchives.map(async (name) => {
          const archive = manifest.architectures[arch][name];
          const url = await ctx.storage.getUrl(archive.storageId as Id<'_storage'>);
          if (!url) throw Error(`Recurso do runtime PDF ausente: ${name}.`);
          return { ...archive, name, url };
        }),
      );
      const bytes = await nativePdf(
        record,
        [...record.institutionalSnapshot, ...record.state.events],
        { version: manifest.version, arch, archives },
      );
      const storageId = await ctx.storage.store(
        new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' }),
      );
      const filename = `${record.purpose === 'test' ? 'teste-' : ''}calendario-${record.state.year}-v${record.version}.pdf`;
      try {
        return await ctx.runMutation(internal.nativeFiles.ticket, {
          storageId,
          filename,
          ephemeral: true,
        });
      } catch (error) {
        await ctx.storage.delete(storageId);
        throw error;
      }
    }),
});
