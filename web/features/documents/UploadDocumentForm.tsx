import { useRef } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import { institution } from '../../shared/convex/institution.ts';
import { filePayload } from '../../upload.ts';
import { useDraftForm } from '../../shared/forms/useDraftForm.ts';
import { FormFeedback } from '../../shared/forms/FormFeedback.tsx';

export default function UploadDocumentForm({
  onUploaded,
  onMessage,
}: {
  onUploaded: (year: string) => void;
  onMessage: (message: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const defaults: {
    year: string;
    type: 'norma' | 'referencia' | 'parecer';
    title: string;
    source: string;
    file: File | null;
  } = { year: '', type: 'norma', title: '', source: '', file: null };
  const { form, values, submit, pending, error } = useDraftForm({
    draftKey: 'document:upload',
    excludeFromDraft: ['file'],
    defaultValues: defaults,
    onSubmit: async (value, { isCurrent }) => {
      if (!value.file) throw new Error('Escolha um PDF de até 8 MB.');
      const payload = await filePayload(value.file);
      await institution.uploadDocument({
        year: Number(value.year),
        type: value.type,
        title: value.title.trim(),
        source: value.source.trim(),
        filename: value.file.name,
        ...payload,
      });
      if (!isCurrent()) return;
      form.reset();
      if (fileInput.current) fileInput.current.value = '';
      onUploaded(value.year);
      onMessage(
        'Arquivo preservado como rascunho. Confira e defina como vigente para disponibilizá-lo aos campi.',
      );
    },
  });
  return (
    <form id="document-form" onSubmit={submit} aria-busy={pending}>
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
            value={values.year}
            onChange={(event) => form.setFieldValue('year', event.target.value)}
          />
        </label>
        <label>
          Tipo
          <select
            id="document-type"
            name="type"
            disabled={pending}
            value={values.type}
            onChange={(event) =>
              form.setFieldValue('type', event.target.value as typeof values.type)
            }
          >
            <option value="norma">Resolução / norma</option>
            <option value="referencia">Calendário de referência PROENS</option>
            <option value="parecer">Modelo de parecer / checklist</option>
          </select>
        </label>
      </div>
      <label>
        Título
        <input
          id="document-title"
          name="title"
          maxLength={240}
          required
          disabled={pending}
          value={values.title}
          onChange={(event) => form.setFieldValue('title', event.target.value)}
        />
      </label>
      <label>
        Identificação e fundamento de aplicação
        <input
          id="document-source"
          name="source"
          maxLength={1000}
          required
          disabled={pending}
          placeholder="Número SEI, resolução e informação sobre aprovação ou vigência"
          value={values.source}
          onChange={(event) => form.setFieldValue('source', event.target.value)}
        />
      </label>
      <label>
        Arquivo PDF (até 8 MB)
        <input
          ref={fileInput}
          id="document-file"
          name="file"
          type="file"
          accept="application/pdf,.pdf"
          required
          disabled={pending}
          onChange={(event) => form.setFieldValue('file', event.target.files?.[0] || null)}
        />
      </label>
      <Button type="submit" disabled={pending}>
        <Upload size={16} aria-hidden="true" />
        Enviar para conferência
      </Button>
      <p className="help">
        O arquivo será salvo como rascunho. Ao sair deste formulário, selecione o arquivo novamente.
      </p>
      <FormFeedback error={error} />
    </form>
  );
}
