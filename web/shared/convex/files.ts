import type { Id } from '../../../convex/_generated/dataModel.js';
import { convex, functions } from './client.ts';
import { request } from './errors.ts';

type DownloadTarget = { kind: 'document'; id: string };

export async function downloadNative(target: DownloadTarget, filename: string) {
  return request(async () => {
    const result = await convex.action(functions.actions.documents.downloadDocument, {
      id: target.id as Id<'documents'>,
    });
    const response = await fetch(result.url);
    if (!response.ok) throw new Error('Não foi possível baixar o arquivo. Tente novamente.');
    return { blob: await response.blob(), filename: result.filename || filename };
  });
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
