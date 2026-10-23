import { Button } from '../components/ui/Button.tsx';
import { formText } from './form-values.ts';
import type { FormEvent } from 'react';
import type { DocumentsData } from '../native/types.ts';
import type { PaginationState } from './Pagination.tsx';
import { nativeError } from '../native/client.ts';
import { useRef, useState } from 'react';
import { Archive, CheckCircle2, Download, Upload } from 'lucide-react';
import { filePayload } from '../upload.ts';
import { downloadLink, institution } from '../native/client.ts';
import Pagination from './Pagination.tsx';
import CollectionPanel from './CollectionPanel.tsx';

const documentTypes = {
  norma: 'Resolução / norma',
  referencia: 'Calendário de referência',
  parecer: 'Modelo de parecer / checklist',
};

export default function DocumentsPanel({
  canManage,
  liveData,
  pagination,
  yearFilter,
  onYearFilter: setYearFilter,
  statusFilter = '',
  onStatusFilter,
}: {
  canManage: boolean;
  liveData?: DocumentsData;
  pagination: PaginationState;
  yearFilter: string;
  onYearFilter: (year: string) => void;
  statusFilter?: string;
  onStatusFilter: (status: '' | 'rascunho' | 'vigente' | 'arquivado') => void;
}) {
  const documents = liveData?.documents ?? [];
  const revision = liveData?.revision ?? 0;
  const [creating, setCreating] = useState(false);
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState('');
  const loading = liveData === undefined;
  const [pending, setPending] = useState(false);
  const mutationPending = useRef(false);

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutationPending.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const file = values.get('file');
    mutationPending.current = true;
    setPending(true);
    setMessage('');
    try {
      if (!(file instanceof File) || !file.name || file.size > 8_000_000)
        throw Error('Escolha um PDF de até 8 MB.');
      if (!(file instanceof File)) throw Error('Escolha um PDF.');
      const payload = await filePayload(file);
      const year = Number(values.get('year'));
      await institution.uploadDocument({
        year,
        type: values.get('type') as keyof typeof documentTypes,
        title: formText(values, 'title'),
        source: formText(values, 'source'),
        filename: file.name,
        ...payload,
      });
      form.reset();
      setCreating(false);
      setYearFilter(String(year));
      onStatusFilter('');
      setConfirmed({});
      setMessage(
        'Arquivo preservado como rascunho. Confira e defina como vigente para disponibilizá-lo aos campi.',
      );
    } catch (error) {
      setMessage(nativeError(error).message);
    } finally {
      mutationPending.current = false;
      setPending(false);
    }
  }

  async function restoreOriginal(
    event: FormEvent<HTMLFormElement>,
    document: DocumentsData['documents'][number],
  ) {
    event.preventDefault();
    if (mutationPending.current) return;
    const form = event.currentTarget;
    const file = new FormData(form).get('original');
    mutationPending.current = true;
    setPending(true);
    setMessage('');
    try {
      if (!(file instanceof File)) throw Error('Escolha um PDF.');
      const payload = await filePayload(file);
      await institution.restoreDocumentOriginal(document.id, payload.uploadId);
      form.reset();
      setMessage('PDF original restaurado. O registro e suas versões foram preservados.');
    } catch (error) {
      setMessage(nativeError(error).message);
    } finally {
      mutationPending.current = false;
      setPending(false);
    }
  }

  async function changeStatus(
    document: DocumentsData['documents'][number],
    status: 'vigente' | 'arquivado',
  ) {
    if (mutationPending.current) return;
    const hasConfirmed = confirmed[document.id] === true;
    if (status === 'vigente' && !hasConfirmed) {
      setMessage('Marque a conferência do documento antes de definir a vigência.');
      return;
    }
    mutationPending.current = true;
    setPending(true);
    setMessage('');
    try {
      await institution.documentStatus(document.id, {
        revision,
        status,
        confirmed: hasConfirmed,
      });
      setConfirmed({});
      setMessage(
        'Vigência atualizada. Calendários e pareceres existentes deverão ser conferidos com a nova base.',
      );
    } catch (error) {
      setMessage(nativeError(error).message);
    } finally {
      mutationPending.current = false;
      setPending(false);
    }
  }

  const year = Number(yearFilter);
  const filteredDocuments = documents
    .filter((document) => !year || document.year === year)
    .sort((a, b) => b.year - a.year || a.type.localeCompare(b.type) || b.version - a.version);
  const busy = pending || loading;

  return (
    <CollectionPanel
      title="Documentos e normas"
      actionLabel="Adicionar documento"
      formTitle="Adicionar nova versão"
      formOpen={creating}
      onFormOpen={setCreating}
      canCreate={canManage}
      busy={pending}
      feedback={
        <p id="document-message" role="status" aria-live="polite">
          {message}
        </p>
      }
      form={
        <form
          id="document-form"
          onSubmit={(event) => {
            void uploadDocument(event);
          }}
          aria-busy={pending}
        >
          <p className="help">
            Enviar um PDF não atualiza as datas nem as regras de análise. Revise os eventos e a
            aplicabilidade da base. Versões anteriores são preservadas.
          </p>
          <div className="row-form">
            <label>
              Ano de aplicação
              <input
                id="document-year"
                name="year"
                type="number"
                min={1900}
                max={9999}
                required
                disabled={pending}
              />
            </label>
            <label>
              Tipo
              <select id="document-type" name="type" disabled={pending}>
                <option value="norma">Resolução / norma</option>
                <option value="referencia">Calendário de referência PROENS</option>
                <option value="parecer">Modelo de parecer / checklist</option>
              </select>
            </label>
          </div>
          <label>
            Título
            <input id="document-title" name="title" maxLength={240} required disabled={pending} />
          </label>
          <label>
            Identificação e fundamento de aplicação
            <input
              id="document-source"
              name="source"
              maxLength={1000}
              required
              placeholder="Número SEI, resolução e informação sobre aprovação ou vigência"
              disabled={pending}
            />
          </label>
          <label>
            Arquivo PDF (até 8 MB)
            <input
              id="document-file"
              name="file"
              type="file"
              accept="application/pdf,.pdf"
              required
              disabled={pending}
            />
          </label>
          <Button type="submit" disabled={busy}>
            <Upload size={16} aria-hidden="true" /> Enviar para conferência
          </Button>
          <p className="help">O arquivo será salvo como rascunho.</p>
        </form>
      }
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
            onChange={(event) => setYearFilter(event.target.value)}
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
      <ul id="document-list" className="records" aria-busy={busy}>
        {filteredDocuments.length ? (
          filteredDocuments.map((document) => (
            <li key={document.id}>
              <div>
                <strong>{document.title}</strong>
                <small>
                  {document.year} · {documentTypes[document.type]} · versão {document.version} ·{' '}
                  {document.status}
                </small>
                <small>{document.source}</small>
                <small>
                  Enviado em {new Date(document.createdAt).toLocaleString('pt-BR')} ·{' '}
                  {document.size
                    ? `${(document.size / 1024).toFixed(0)} KB`
                    : 'Tamanho indisponível'}
                </small>
                <a
                  href={`#document-${document.id}`}
                  data-download-document={document.id}
                  onClick={(event) =>
                    void downloadLink(
                      event,
                      { kind: 'document', id: document.id },
                      document.filename,
                    ).catch((error) => setMessage(nativeError(error).message))
                  }
                >
                  <Download size={16} aria-hidden="true" /> Baixar PDF
                </a>
                {document.unavailableFile ? (
                  <>
                    <p className="notice">
                      PDF original aguardando restauração pela administração.
                    </p>
                    {canManage ? (
                      <form
                        data-restore-document={document.id}
                        aria-busy={pending}
                        onSubmit={(event) => {
                          void restoreOriginal(event, document);
                        }}
                      >
                        <label>
                          PDF original
                          <input
                            type="file"
                            name="original"
                            accept="application/pdf,.pdf"
                            required
                            disabled={busy}
                          />
                        </label>
                        <p className="help">
                          Selecione o mesmo PDF original deste registro. O registro e suas versões
                          serão preservados.
                        </p>
                        <Button type="submit" disabled={busy}>
                          <Upload size={16} aria-hidden="true" />
                          {pending ? 'Restaurando…' : 'Restaurar PDF original'}
                        </Button>
                      </form>
                    ) : null}
                  </>
                ) : null}
                {canManage ? (
                  <div>
                    {document.status !== 'vigente' ? (
                      <>
                        <label className="check">
                          <input
                            type="checkbox"
                            data-confirm-document={document.id}
                            checked={confirmed[document.id] === true}
                            disabled={busy}
                            onChange={(event) =>
                              setConfirmed((current) => ({
                                ...current,
                                [document.id]: event.target.checked,
                              }))
                            }
                          />
                          Conferi o arquivo, o ano e sua aplicabilidade. Ao definir como vigente, a
                          versão anterior deste tipo e ano será arquivada.
                        </label>
                        <Button
                          type="button"
                          data-document-status="vigente"
                          data-document-id={document.id}
                          disabled={busy}
                          onClick={() => {
                            void changeStatus(document, 'vigente');
                          }}
                        >
                          <CheckCircle2 size={16} aria-hidden="true" /> Definir como vigente
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        data-document-status="arquivado"
                        data-document-id={document.id}
                        disabled={busy}
                        onClick={() => {
                          void changeStatus(document, 'arquivado');
                        }}
                      >
                        <Archive size={16} aria-hidden="true" /> Retirar de vigência
                      </Button>
                    )}
                  </div>
                ) : null}
              </div>
            </li>
          ))
        ) : (
          <li>
            {loading
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
