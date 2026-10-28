import { convex, functions } from './shared/convex/client.ts';
import { nativeError } from './shared/convex/errors.ts';

export async function filePayload(file: File) {
  if (!file || file.size < 5 || file.size > 8_000_000 || !file.name.toLowerCase().endsWith('.pdf'))
    throw new Error('Escolha um PDF de até 8 MB.');
  try {
    const ticket = await convex.mutation(functions.nativeFiles.issueUpload, {
      filename: file.name,
      size: file.size,
    });
    return await convex.mutation(functions.nativeFiles.receiveUpload, {
      uploadId: ticket.uploadId,
      bytes: await file.arrayBuffer(),
    });
  } catch (error) {
    throw nativeError(error);
  }
}
