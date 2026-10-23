import { convex, functions, nativeEnabled, nativeError } from './native/client.js';

export async function filePayload(file, purpose, calendarId) {
  if (!file || file.size > 8_000_000 || !file.name.toLowerCase().endsWith('.pdf'))
    throw Error('Escolha um PDF de até 8 MB.');
  if (nativeEnabled) {
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
      if (!response.ok) throw Error('Não foi possível enviar o PDF. Tente novamente.');
      const { storageId } = await response.json();
      return await convex.action(functions.nativeActions.completeUpload, {
        uploadId: ticket.uploadId,
        storageId,
      });
    } catch (error) {
      throw nativeError(error);
    }
  }
  const mode = await fetch('/api/file-mode');
  if (!mode.ok) throw Error('Entre novamente para enviar arquivos.');
  if ((await mode.json()).direct) {
    const response = await fetch('/api/upload-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Dentec-Request': '1' },
        body: JSON.stringify({ filename: file.name, size: file.size, purpose, calendarId }),
      }),
      ticket = await response.json();
    if (!response.ok) throw Error(ticket.error);
    const uploaded = await fetch(
      ticket.url,
      ticket.encoding === 'base64'
        ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Dentec-Request': '1' },
            body: JSON.stringify({ data: await readBase64(file) }),
          }
        : {
            method: 'PUT',
            headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'false' },
            body: await file.arrayBuffer(),
          },
    );
    if (!uploaded.ok) throw Error('Não foi possível enviar o PDF. Tente novamente.');
    return { uploadId: ticket.id };
  }
  return { data: await readBase64(file) };
}

function readBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(Error('Não foi possível ler o PDF.'));
    reader.readAsDataURL(file);
  });
}
