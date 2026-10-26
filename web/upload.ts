import type { Id } from '../convex/_generated/dataModel.js';
import { convex, functions } from './shared/convex/client.ts';
import { nativeError } from './shared/convex/errors.ts';

export async function filePayload(file: File) {
  if (!file || file.size > 8_000_000 || !file.name.toLowerCase().endsWith('.pdf'))
    throw new Error('Escolha um PDF de até 8 MB.');
  try {
    const ticket = await convex.mutation(functions.nativeFiles.issueUpload, {
      filename: file.name,
      size: file.size,
    });
    const response = await fetch(ticket.uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: file,
    });
    if (!response.ok) throw new Error('Não foi possível enviar o PDF. Tente novamente.');
    const uploaded: unknown = await response.json();
    if (
      !uploaded ||
      typeof uploaded !== 'object' ||
      !('storageId' in uploaded) ||
      typeof uploaded.storageId !== 'string'
    )
      throw new Error('O armazenamento não confirmou o envio do PDF.');
    return await convex.action(functions.actions.uploads.completeUpload, {
      uploadId: ticket.uploadId,
      storageId: uploaded.storageId as Id<'_storage'>,
    });
  } catch (error) {
    throw nativeError(error);
  }
}
