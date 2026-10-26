import type { RefObject, FormEvent, Dispatch, SetStateAction } from 'react';
import { ClipboardCopy, Download, ExternalLink, Eye, Pencil, Save } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import { TextField } from '../../components/ui/Field.tsx';
import { calendarName } from '../../../src/calendar-label.ts';
import { editorUrl } from '../../../src/app-routes.ts';
import ReviewCriterion from './ReviewCriterion.tsx';
import { ReviewPreview } from './review-export.tsx';
import { FormFeedback } from '../../shared/forms/FormFeedback.tsx';
import type { ReviewDraft, ReviewEntry, ReviewDocument } from './review-values.ts';

interface Props {
  draft: ReviewDraft;
  busy: boolean;
  pending: string;
  error: string;
  preview: ReviewDocument | null;
  previewRef: RefObject<HTMLDivElement | null>;
  conclusionRef: RefObject<HTMLTextAreaElement | null>;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  setDraft: Dispatch<SetStateAction<ReviewDraft>>;
  changeField: <K extends 'conclusion' | 'processNumber' | 'applicableNorm' | 'acknowledgeStale'>(
    field: K,
    value: ReviewDraft[K],
  ) => void;
  changeEntry: <K extends 'status' | 'notes'>(id: string, field: K, value: ReviewEntry[K]) => void;
  confirmEntry: (id: string) => void;
  exportReview: (format: 'preview' | 'copy' | 'html' | 'txt') => Promise<void>;
}

export default function ReviewFormView({
  draft,
  busy,
  pending,
  error,
  preview,
  previewRef,
  conclusionRef,
  submit,
  setDraft,
  changeField,
  changeEntry,
  confirmEntry,
  exportReview,
}: Props) {
  const opened = draft.opened;
  const dirty = draft.dirty;
  const reviewedCount = draft.entries.filter((entry) => entry.reviewed).length;
  return (
    <div id="review-content">
      <h3 id="review-heading">
        {opened.calendar.name === calendarName(opened.calendar.year, opened.calendar.campus)
          ? opened.calendar.name
          : `${opened.calendar.campus} · ${opened.calendar.name}`}
      </h3>
      <p id="review-progress">
        {reviewedCount} de {opened.criteria.length} critérios conferidos.
      </p>
      <p id="review-conflicts">
        {opened.conflicts.length
          ? `${opened.conflicts.length} conflito(s) de inclusão/exclusão: ${opened.conflicts.map((conflict) => conflict.date).join(', ')}. Confira no editor.`
          : opened.countError || 'Nenhum conflito de inclusão/exclusão identificado.'}
      </p>
      <p id="review-author">
        {opened.review
          ? `Último registro: ${opened.review.reviewer.name} · ${new Date(opened.review.updatedAt).toLocaleString('pt-BR')} · Revisão ${opened.review.revision}${opened.stale ? ' — DESATUALIZADA: calendário ou base institucional mudou.' : ''}`
          : 'Ainda não há revisão humana registrada.'}
      </p>
      <a
        id="review-editor"
        href={editorUrl(opened.calendar.id, 'calendar')}
        target="_blank"
        rel="noopener"
      >
        <ExternalLink size={16} aria-hidden="true" /> Abrir calendário em outra aba
      </a>
      <div className="review-save-status" role="status">
        {dirty
          ? 'Há alterações por salvar. Confirmar um critério não salva a análise.'
          : opened.review
            ? 'Todas as alterações foram salvas.'
            : 'A análise ainda não foi salva.'}
      </div>
      <div className="actions review-export-actions">
        <Button
          type="button"
          id="preview-review"
          variant="secondary"
          disabled={busy}
          onClick={() => {
            void exportReview('preview');
          }}
        >
          <Eye size={18} aria-hidden="true" /> Visualizar parecer
        </Button>
        <Button
          type="button"
          id="download-review-html"
          variant="secondary"
          disabled={busy}
          onClick={() => {
            void exportReview('html');
          }}
        >
          <Download size={18} aria-hidden="true" /> Baixar parecer para SEI (HTML)
        </Button>
        <Button
          type="button"
          id="download-review-txt"
          variant="secondary"
          disabled={busy}
          onClick={() => {
            void exportReview('txt');
          }}
        >
          <Download size={18} aria-hidden="true" /> Baixar texto
        </Button>
        <Button
          type="button"
          id="copy-review"
          variant="secondary"
          disabled={busy}
          onClick={() => {
            void exportReview('copy');
          }}
        >
          <ClipboardCopy size={18} aria-hidden="true" /> Copiar parecer para SEI
        </Button>
        <Button type="submit" form="review-form" disabled={busy}>
          <Save size={18} aria-hidden="true" />{' '}
          {pending === 'save' ? 'Salvando análise…' : 'Salvar análise'}
        </Button>
      </div>
      <form id="review-form" onSubmit={submit}>
        <div className="row-form">
          <TextField
            label="Processo SEI nº"
            id="review-process"
            maxLength={100}
            placeholder="Informe o número do processo"
            disabled={busy}
            value={draft.processNumber}
            onValueChange={(value) => changeField('processNumber', value)}
          />
          <TextField
            label="Norma vigente do ano analisado"
            id="review-norm"
            maxLength={1000}
            placeholder="Resolução e identificação oficial"
            disabled={busy}
            value={draft.applicableNorm}
            onValueChange={(value) => changeField('applicableNorm', value)}
          />
        </div>
        <p className="help">
          A busca por nome e categoria pode omitir registros ou relacionar itens indevidos; confira
          as evidências antes de concluir.
        </p>
        {!opened.sameYear ? (
          <p id="review-year-warning" className="notice" role="status">
            Referência: Parecer SEI 3959640 ({opened.source.year}), páginas 1 e 2. Confira a norma
            aplicável a {opened.calendar.year}.
          </p>
        ) : null}
        <ul id="review-items" className="records">
          {opened.criteria.map((criterion, index) => (
            <ReviewCriterion
              key={criterion.id}
              criterion={criterion}
              number={index + 1}
              entry={draft.entries.find((entry) => entry.id === criterion.id) || criterion.initial}
              changed={Boolean(draft.changed[criterion.id])}
              saved={Boolean(opened.review?.entries.some((entry) => entry.id === criterion.id))}
              busy={busy}
              onChange={(field, value) => changeEntry(criterion.id, field, value)}
              onConfirm={() => confirmEntry(criterion.id)}
            />
          ))}
        </ul>
        <Button
          type="button"
          id="edit-conclusion"
          variant="secondary"
          disabled={busy}
          onClick={() =>
            setDraft((current) => (current ? { ...current, conclusionEditable: true } : current))
          }
        >
          <Pencil size={16} aria-hidden="true" /> Editar texto do parecer
        </Button>
        <label>
          Conclusão do parecerista — texto proposto
          <textarea
            id="review-conclusion"
            ref={conclusionRef}
            disabled={!draft.conclusionEditable || busy}
            maxLength={8000}
            rows={5}
            value={draft.conclusion}
            onChange={(event) => changeField('conclusion', event.target.value)}
          />
        </label>
        {opened.stale ? (
          <label id="review-stale-label" className="check">
            <input
              id="review-stale"
              type="checkbox"
              required
              disabled={busy}
              checked={draft.acknowledgeStale}
              onChange={(event) => changeField('acknowledgeStale', event.target.checked)}
            />
            Reavaliei as conclusões anteriores considerando a nova versão do calendário/base.
          </label>
        ) : null}
        <p className="help">
          Use as observações para registrar evidências ou justificar sua avaliação quando
          necessário.
        </p>
        <Button type="submit" disabled={busy}>
          <Save size={18} aria-hidden="true" />{' '}
          {pending === 'save' ? 'Salvando análise…' : 'Salvar análise'}
        </Button>
      </form>
      <p className="help">
        Salve a análise antes de exportar. Confira a formatação ao colar no SEI.
      </p>
      <FormFeedback error={error} />
      <ReviewPreview document={preview} previewRef={previewRef} />
    </div>
  );
}
