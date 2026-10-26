import { useEffect, useRef } from 'react';
import { Archive, CheckCircle2, Download, Upload } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import { downloadLink } from '../../shared/convex/files.ts';
import { institution } from '../../shared/convex/institution.ts';
import { nativeError } from '../../shared/convex/errors.ts';
import type { DocumentsData } from '../../shared/convex/types.ts';
import { useDraftForm } from '../../shared/forms/useDraftForm.ts';
import { FormFeedback } from '../../shared/forms/FormFeedback.tsx';
import { filePayload } from '../../upload.ts';

type Document = DocumentsData['documents'][number];
export const documentTypes = {
  norma: 'Resolução / norma',
  referencia: 'Calendário de referência',
  parecer: 'Modelo de parecer / checklist',
};

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
    <form onSubmit={submit}>
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
        disabled={pending}
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
        <p className="notice" role="status">
          A base mudou em outra sessão. Atualize a lista e confira novamente o documento antes de
          definir sua vigência.
        </p>
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
    <li>
      <div>
        <strong>{document.title}</strong>
        <small>
          {document.year} · {documentTypes[document.type]} · versão {document.version} ·{' '}
          {document.status}
        </small>
        <small>{document.source}</small>
        <small>
          Enviado em {new Date(document.createdAt).toLocaleString('pt-BR')} ·{' '}
          {document.size ? `${(document.size / 1024).toFixed(0)} KB` : 'Tamanho indisponível'}
        </small>
        <a
          href={`#document-${document.id}`}
          data-download-document={document.id}
          onClick={(event) =>
            void downloadLink(
              event,
              { kind: 'document', id: document.id },
              document.filename,
            ).catch((cause) => onMessage(nativeError(cause).message))
          }
        >
          <Download size={16} aria-hidden="true" />
          Baixar PDF
        </a>
        {document.unavailableFile ? (
          <>
            <p className="notice">PDF original aguardando restauração pela administração.</p>
            {canManage ? <RestoreDocumentForm document={document} onMessage={onMessage} /> : null}
          </>
        ) : null}
        {canManage ? (
          <DocumentStatusForm document={document} revision={revision} onMessage={onMessage} />
        ) : null}
      </div>
    </li>
  );
}
