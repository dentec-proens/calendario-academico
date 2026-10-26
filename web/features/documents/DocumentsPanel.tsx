import { useState } from 'react';
import type { DocumentsData } from '../../shared/convex/types.ts';
import type { PaginationState } from '../../shared/forms/Pagination.tsx';
import Pagination from '../../shared/forms/Pagination.tsx';
import CollectionPanel from '../../shared/forms/CollectionPanel.tsx';
import { useRouteForm } from '../../app/navigation.ts';
import UploadDocumentForm from './UploadDocumentForm.tsx';
import DocumentRecord from './DocumentRecord.tsx';
import './documents.css';
import { Notice } from '../../components/ui/Notice.tsx';

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
      title="Base institucional"
      actionLabel="Adicionar documento"
      actionVariant="secondary"
      formTitle="Adicionar nova versão"
      formOpen={creating}
      onFormOpen={setCreating}
      canCreate={canManage}
      feedback={
        <div id="document-message" role="status" aria-live="polite">
          {message ? <Notice tone="success">{message}</Notice> : null}
        </div>
      }
      form={<UploadDocumentForm onUploaded={onUploaded} onMessage={setMessage} />}
    >
      <p className="documents-description">
        Consulte as normas e os documentos que orientam a elaboração do calendário acadêmico.
      </p>
      <div className="documents-filters">
        <label>
          Ano
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
            Situação
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
        {liveData ? (
          <p className="documents-count" role="status">
            {documents.length} documento{documents.length === 1 ? '' : 's'}
            {pagination.status !== 'Exhausted'
              ? ` carregado${documents.length === 1 ? '' : 's'}`
              : ''}
          </p>
        ) : null}
      </div>
      <ul id="document-list" className="document-list" aria-busy={!liveData}>
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
