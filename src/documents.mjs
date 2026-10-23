import { createHash, randomUUID } from 'node:crypto';
import { documentTypes, documentMetadata } from './document-state.mjs';

const fail = (message, status = 400) => {
  throw Object.assign(Error(message), { status });
};

export {
  documentTypes,
  documentMetadata,
  documentSnapshot,
  setDocumentStatus,
} from './document-state.mjs';

export function registerDocument(db, body, actor) {
  const year = Number(body.year);
  if (!Number.isInteger(year) || year < 1900 || year > 9999 || !documentTypes.includes(body.type))
    fail('Informe ano e tipo válidos.');
  for (const [key, max] of [
    ['title', 240],
    ['source', 1000],
    ['filename', 180],
  ])
    if (typeof body[key] !== 'string' || !body[key].trim() || body[key].length > max)
      fail('Informe título, identificação da fonte e nome do arquivo.');
  if (
    !body.filename.toLowerCase().endsWith('.pdf') ||
    typeof body.data !== 'string' ||
    !body.data.length ||
    body.data.length > 10_666_668 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(body.data)
  )
    fail('Envie um PDF de até 8 MB.');
  const file = Buffer.from(body.data, 'base64');
  if (file.length > 8_000_000 || file.subarray(0, 5).toString() !== '%PDF-')
    fail('PDF inválido ou maior que 8 MB.');
  db.documents ??= [];
  const d = {
    id: randomUUID(),
    year,
    type: body.type,
    title: body.title.trim(),
    source: body.source.trim(),
    filename: body.filename.trim(),
    size: file.length,
    hash: createHash('sha256').update(file).digest('hex'),
    data: file.toString('base64'),
    status: 'rascunho',
    version:
      1 +
      Math.max(
        0,
        ...db.documents
          .filter((d) => d.year === year && d.type === body.type)
          .map((d) => d.version),
      ),
    createdAt: new Date().toISOString(),
    createdBy: actor,
  };
  db.documents.push(d);
  db.audit.push({ at: d.createdAt, actor, action: 'UPLOAD_INSTITUTIONAL_DOCUMENT', id: d.id });
  return documentMetadata(d);
}
