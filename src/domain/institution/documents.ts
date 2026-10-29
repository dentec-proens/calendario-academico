import { DomainError } from '../errors.ts';
interface DocumentRecord {
  id: string;
  year: number;
  type: string;
  status: string;
  data?: unknown;
  publishedAt?: string;
  publishedBy?: string;
  archivedAt?: string;
}
const fail = (message: string, status: 400 | 404 | 409 = 400): never => {
  throw new DomainError(message, status);
};
export const documentTypes = ['norma', 'referencia', 'parecer'];
export const documentMetadata = <T extends { data?: unknown }>(item: T) => {
  const { data: _data, ...metadata } = item;
  return metadata;
};

export function documentSnapshot<T extends DocumentRecord>(db: { documents?: T[] }, year: number) {
  return (db.documents || [])
    .filter((d) => d.year === year && d.status === 'vigente')
    .map(documentMetadata);
}

export function setDocumentStatus(
  db: {
    documents: DocumentRecord[];
    catalogue: { revision: number };
    audit: { at: string; actor: string; action: string; id: string }[];
  },
  id: string,
  body: { revision: number; status: string; confirmed?: boolean },
  actor: string,
) {
  if (body.revision !== db.catalogue.revision)
    fail('A base mudou. Atualize a lista antes de continuar.', 409);
  const d = (db.documents || []).find((d) => d.id === id);
  if (!d) return fail('Documento não encontrado.', 404);
  if (!['vigente', 'arquivado'].includes(body.status)) fail('Situação inválida.');
  if (body.status === 'vigente' && body.confirmed !== true)
    fail('Confirme a conferência do ano e da aplicabilidade do documento.');
  if (d.status === body.status) return documentMetadata(d);
  const at = new Date().toISOString();
  if (body.status === 'vigente')
    for (const prior of db.documents)
      if (prior.year === d.year && prior.type === d.type && prior.status === 'vigente') {
        prior.status = 'arquivado';
        prior.archivedAt = at;
      }
  d.status = body.status;
  if (body.status === 'vigente') {
    d.publishedAt = at;
    d.publishedBy = actor;
  } else d.archivedAt = at;
  db.catalogue.revision++;
  db.audit.push({
    at,
    actor,
    action: 'SET_INSTITUTIONAL_DOCUMENT_' + body.status.toUpperCase(),
    id: d.id,
  });
  return documentMetadata(d);
}
