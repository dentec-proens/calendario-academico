import { useEffect, useRef } from 'react';
import { Link } from '@tanstack/react-router';
import {
  Archive,
  CheckCircle2,
  ChevronDown,
  Ellipsis,
  ExternalLink,
  FileText,
  Upload,
} from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import { institution } from '../../shared/convex/institution.ts';
import { confirmAction } from '../../components/confirmation.ts';
import type { DocumentsData } from '../../shared/convex/types.ts';
import { useDraftForm } from '../../shared/forms/useDraftForm.ts';
import { FormFeedback } from '../../shared/forms/FormFeedback.tsx';
import { filePayload } from '../../upload.ts';
import { Notice } from '../../components/ui/Notice.tsx';
import { documentTypeLabels } from './document-types.ts';

type Document = DocumentsData['documents'][number];
const documentStatuses = { rascunho: 'Rascunho', vigente: 'Vigente', arquivado: 'Arquivado' };

function RestoreDocumentForm({
  document,
  onMessage,
}: {
  document: Document;
  onMessage: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { form, submit, pending, error } = useDraftForm({
    defaultValues: { original: null as File | null },
    onSubmit: async (value, { isCurrent }) => {
      if (!value.original) throw new Error('Escolha um PDF.');
      const payload = await filePayload(value.original);
      await institution.restoreDocumentOriginal(document.id, payload.uploadId);
      if (!isCurrent()) return;
      form.reset();
      if (input.current) input.current.value = '';
      onMessage('PDF original restaurado. O registro e suas versões foram preservados.');
    },
  });
  return (
    <form data-restore-document={document.id} aria-busy={pending} onSubmit={submit}>
      <label>
        PDF original
        <input
          ref={input}
          type="file"
          name="original"
          accept="application/pdf,.pdf"
          required
          disabled={pending}
          onChange={(event) => form.setFieldValue('original', event.target.files?.[0] || null)}
        />
      </label>
      <p className="help">
        Selecione o mesmo PDF original deste registro. O registro e suas versões serão preservados.
      </p>
      <Button type="submit" disabled={pending}>
        <Upload size={16} aria-hidden="true" />
        {pending ? 'Restaurando…' : 'Restaurar PDF original'}
      </Button>
      <FormFeedback error={error} />
    </form>
  );
}

function DocumentStatusForm({
  document,
  revision,
  onMessage,
}: {
  document: Document;
  revision: number;
  onMessage: (message: string) => void;
}) {
  const { form, values, dirty, submit, pending, error } = useDraftForm({
    draftKey: `document:status:${document.id}`,
    defaultValues: { confirmed: false, revision, status: document.status },
    onSubmit: async (value, { isCurrent }) => {
      const status = value.status === 'vigente' ? 'arquivado' : 'vigente';
      if (status === 'vigente' && !value.confirmed)
        throw new Error('Marque a conferência do documento antes de definir a vigência.');
      if (
        status === 'arquivado' &&
        !(await confirmAction({
          title: 'Retirar documento de vigência?',
          description: `${document.title} · ${document.year} · versão ${document.version}`,
          consequence:
            'O documento será preservado no histórico. Calendários e pareceres existentes deverão ser conferidos com a nova base.',
          confirmLabel: 'Retirar de vigência',
          intent: 'warning',
        }))
      )
        return;
      await institution.documentStatus(document.id, {
        revision: value.revision,
        status,
        confirmed: value.confirmed,
      });
      if (!isCurrent()) return;
      form.reset();
      onMessage(
        'Vigência atualizada. Calendários e pareceres existentes deverão ser conferidos com a nova base.',
      );
    },
  });
  const remoteChanged = values.revision !== revision || values.status !== document.status;
  useEffect(() => {
    if (!remoteChanged || dirty || pending) return;
    form.reset({ confirmed: false, revision, status: document.status });
  }, [dirty, document.status, form, pending, remoteChanged, revision]);
  return (
    <form className="document-status-form" onSubmit={submit}>
      <h4>
        {values.status === 'vigente' ? 'Vigência do documento' : 'Conferir e definir vigência'}
      </h4>
      {values.status !== 'vigente' ? (
        <label className="check">
          <input
            type="checkbox"
            data-confirm-document={document.id}
            checked={values.confirmed}
            disabled={pending}
            onChange={(event) => form.setFieldValue('confirmed', event.target.checked)}
          />
          Conferi o arquivo, o ano e sua aplicabilidade. Ao definir como vigente, a versão anterior
          deste tipo e ano será arquivada.
        </label>
      ) : null}
      <Button
        type="submit"
        variant={values.status === 'vigente' ? 'secondary' : 'primary'}
        data-document-status={values.status === 'vigente' ? 'arquivado' : 'vigente'}
        data-document-id={document.id}
        disabled={pending || (values.status !== 'vigente' && !values.confirmed)}
      >
        {values.status === 'vigente' ? (
          <>
            <Archive size={16} aria-hidden="true" />
            Retirar de vigência
          </>
        ) : (
          <>
            <CheckCircle2 size={16} aria-hidden="true" />
            Definir como vigente
          </>
        )}
      </Button>
      {remoteChanged && dirty ? (
        <Notice tone="warning" announce="polite">
          A base mudou em outra sessão. Atualize a lista e confira novamente o documento antes de
          definir sua vigência.
        </Notice>
      ) : null}
      <FormFeedback error={error} />
    </form>
  );
}

export default function DocumentRecord({
  document,
  canManage,
  revision,
  onMessage,
}: {
  document: Document;
  canManage: boolean;
  revision: number;
  onMessage: (message: string) => void;
}) {
  return (
    <li className="document-record">
      <FileText className="document-record__icon" size={24} aria-hidden="true" />
      <div className="document-record__body">
        <div className="document-record__heading">
          <h3>{document.title}</h3>
          <span className="document-status" data-status={document.status}>
            {documentStatuses[document.status]}
          </span>
        </div>
        <p className="document-record__meta">
          {document.year} · {documentTypeLabels[document.type]} · Versão {document.version}
        </p>
        <p className="document-record__meta">{document.source}</p>
        <div className="document-record__actions">
          {!document.unavailableFile ? (
            <Link
              to="/documentos/$documentId/abrir"
              params={{ documentId: document.id }}
              target="_blank"
              rel="noopener noreferrer"
              className="document-open-link"
            >
              <ExternalLink size={16} aria-hidden="true" /> Abrir PDF em outra aba
            </Link>
          ) : null}
          <details className="document-details">
            <summary>
              Detalhes <ChevronDown size={14} aria-hidden="true" />
            </summary>
            <dl>
              <div>
                <dt>Enviado em</dt>
                <dd>{new Date(document.createdAt).toLocaleString('pt-BR')}</dd>
              </div>
              <div>
                <dt>Arquivo</dt>
                <dd>{document.filename}</dd>
              </div>
              <div>
                <dt>Tamanho</dt>
                <dd>
                  {document.size ? `${(document.size / 1024).toFixed(0)} KB` : 'Indisponível'}
                </dd>
              </div>
            </dl>
          </details>
          {canManage ? (
            <details className="document-manage">
              <summary>
                <Ellipsis size={16} aria-hidden="true" /> Gerenciar
              </summary>
              <DocumentStatusForm document={document} revision={revision} onMessage={onMessage} />
              {document.unavailableFile ? (
                <RestoreDocumentForm document={document} onMessage={onMessage} />
              ) : null}
            </details>
          ) : null}
        </div>
        {document.unavailableFile ? (
          <Notice tone="warning">PDF original aguardando restauração pela administração.</Notice>
        ) : null}
      </div>
    </li>
  );
}
