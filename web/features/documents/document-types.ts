import type { DocumentsData } from '../../shared/convex/types.ts';

export type DocumentType = DocumentsData['documents'][number]['type'];

/** Single source of the labels shown when uploading and listing documents. */
export const documentTypeLabels: Record<DocumentType, string> = {
  norma: 'Resolução / norma',
  referencia: 'Calendário de referência PROENS',
  parecer: 'Modelo de parecer / checklist',
};

export const documentTypes = Object.keys(documentTypeLabels) as DocumentType[];
