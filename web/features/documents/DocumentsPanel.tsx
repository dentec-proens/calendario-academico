import { useState } from 'react';
import type { DocumentsData } from '../../shared/convex/types.ts';
import type { PaginationState } from '../../shared/forms/Pagination.tsx';
import Pagination from '../../shared/forms/Pagination.tsx';
import CollectionPanel from '../../shared/forms/CollectionPanel.tsx';
import { useRouteForm } from '../../app/navigation.ts';
import UploadDocumentForm from './UploadDocumentForm.tsx';
import DocumentRecord from './DocumentRecord.tsx';

export default function DocumentsPanel({
  canManage,
  liveData,
  pagination,
  yearFilter,
  onYearFilter,
  statusFilter = '',
  onStatusFilter,
  onUploaded,
}: {
  canManage: boolean;
  liveData?: DocumentsData;
  pagination: PaginationState;
  yearFilter: string;
  onYearFilter: (year: string) => void;
  statusFilter?: string;
  onStatusFilter: (status: '' | 'rascunho' | 'vigente' | 'arquivado') => void;
  onUploaded: (year: string) => void;
}) {
  const [creating, setCreating] = useRouteForm('institution');
  const [message, setMessage] = useState('');
  const year = Number(yearFilter);
  const documents = (liveData?.documents ?? [])
    .filter((document) => !year || document.year === year)
    .sort((a, b) => b.year - a.year || a.type.localeCompare(b.type) || b.version - a.version);
  return (
    <CollectionPanel
      title="Documentos e normas"
      actionLabel="Adicionar documento"
      formTitle="Adicionar nova versão"
      formOpen={creating}
      onFormOpen={setCreating}
      canCreate={canManage}
      feedback={
        <p id="document-message" role="status" aria-live="polite">
          {message}
        </p>
      }
      form={<UploadDocumentForm onUploaded={onUploaded} onMessage={setMessage} />}
    >
      <div className="row-form">
        <label>
          Filtrar documentos por ano
          <input
            id="document-year-filter"
            type="number"
            min={1900}
            max={9999}
            placeholder="Todos os anos"
            value={yearFilter}
            onChange={(event) => onYearFilter(event.target.value)}
          />
        </label>
        {canManage ? (
          <label>
            Situação do documento
            <select
              id="document-status-filter"
              value={statusFilter}
              onChange={(event) =>
                onStatusFilter(event.target.value as '' | 'rascunho' | 'vigente' | 'arquivado')
              }
            >
              <option value="">Todas as situações</option>
              <option value="rascunho">Rascunhos</option>
              <option value="vigente">Vigentes</option>
              <option value="arquivado">Arquivados</option>
            </select>
          </label>
        ) : null}
      </div>
      <ul id="document-list" className="records" aria-busy={!liveData}>
        {documents.length ? (
          documents.map((document) => (
            <DocumentRecord
              key={document.id}
              document={document}
              canManage={canManage}
              revision={liveData?.revision || 0}
              onMessage={setMessage}
            />
          ))
        ) : (
          <li>
            {!liveData
              ? 'Carregando documentos…'
              : statusFilter
                ? 'Nenhum documento encontrado para os filtros selecionados.'
                : year
                  ? `Nenhum documento disponível para o ano ${year}.`
                  : 'Nenhum documento PDF cadastrado.'}
          </li>
        )}
      </ul>
      <Pagination pagination={pagination} label="Carregar mais documentos" />
    </CollectionPanel>
  );
}
