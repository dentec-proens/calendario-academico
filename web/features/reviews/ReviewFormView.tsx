import { useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { Copy, Eye, FileCode2, FileText, Pencil, Save, X } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import { assessmentCounts, assessmentSituation } from '#src/domain/reviews/criteria.ts';
import { TextField } from '../../components/ui/Field.tsx';
import ReviewCriterion from './ReviewCriterion.tsx';
import ReviewIndex, { reviewFilterLabels, type ReviewFilter } from './ReviewIndex.tsx';
import { ReviewPreview } from './review-export.tsx';
import { FormFeedback } from '../../shared/forms/FormFeedback.tsx';
import type { ReviewDraft, ReviewEntry, ReviewDocument } from './review-values.ts';
import { Notice } from '../../components/ui/Notice.tsx';

interface Props {
  /** What precedes the form: the state of the parecer and its comparison. */
  summary: ReactNode;
  draft: ReviewDraft;
  busy: boolean;
  /** The review is saved only while the calendar is submitted or under review. */
  locked: boolean;
  /** Locked, or held by someone else. */
  readOnly: boolean;
  /** Who holds the parecer, when it is someone else. */
  heldBy?: string;
  pending: string;
  error: string;
  preview: ReviewDocument | null;
  previewRef: RefObject<HTMLDivElement | null>;
  conclusionRef: RefObject<HTMLTextAreaElement | null>;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  conclusionEditable: boolean;
  onEditConclusion: () => void;
  changeField: <K extends 'conclusion' | 'processNumber' | 'applicableNorm' | 'acknowledgeStale'>(
    field: K,
    value: ReviewDraft[K],
  ) => void;
  changeEntry: <K extends 'status' | 'notes'>(id: string, field: K, value: ReviewEntry[K]) => void;
  exportReview: (format: 'preview' | 'copy' | 'html' | 'txt') => Promise<void>;
  closePreview: () => void;
}

export default function ReviewFormView({
  summary,
  draft,
  busy,
  locked,
  readOnly,
  heldBy,
  pending,
  error,
  preview,
  previewRef,
  conclusionRef,
  submit,
  conclusionEditable,
  onEditConclusion,
  changeField,
  changeEntry,
  exportReview,
  closePreview,
}: Props) {
  const opened = draft.opened;
  const dirty = draft.dirty;
  const idsIn = (situation: ReviewFilter) =>
    new Set(
      draft.entries
        .filter((entry) => assessmentSituation(entry) === situation)
        .map((entry) => entry.id),
    );
  const [filter, setFilter] = useState<ReviewFilter>('all');
  // The filtered list holds still until the filter changes or the parecer is saved, so choosing an
  // assessment never takes a criterion away before its observation is written.
  const [listed, setListed] = useState<ReadonlySet<string>>(new Set());
  // `opened` changes whenever the form is reset: on saving and on what another session changed.
  const [listedFor, setListedFor] = useState(opened);
  if (listedFor !== opened) {
    setListedFor(opened);
    setListed(idsIn(filter));
  }
  const rules = opened.rulesetVersion?.match(/-(v\d+)$/)?.[1];
  return (
    <div id="review-content">
      {summary}
      <form id="review-form" onSubmit={submit}>
        <div className="row-form">
          <TextField
            label="Processo SEI nº"
            id="review-process"
            maxLength={100}
            placeholder="Informe o número do processo"
            disabled={busy || readOnly}
            value={draft.processNumber}
            onValueChange={(value) => changeField('processNumber', value)}
          />
          <TextField
            label="Norma vigente do ano analisado"
            id="review-norm"
            maxLength={1000}
            placeholder="Resolução e identificação oficial"
            disabled={busy || readOnly}
            value={draft.applicableNorm}
            onValueChange={(value) => changeField('applicableNorm', value)}
          />
        </div>
        <div className="review-criteria-heading">
          <div className="review-criteria-heading__title">
            <h3>Critérios</h3>
            <p className="help" data-ruleset>
              {rules ? `${opened.source.norm} · regras ${rules}` : 'Ano sem norma configurada'}
            </p>
          </div>
          <ReviewIndex
            total={opened.criteria.length}
            counts={assessmentCounts(draft.entries)}
            filter={filter}
            onChange={(value) => {
              setFilter(value);
              setListed(idsIn(value));
            }}
          />
          <p className="visually-hidden" role="status">
            {filter === 'all'
              ? `Mostrando ${opened.criteria.length} critérios.`
              : `Mostrando ${listed.size} de ${opened.criteria.length} critérios: ${reviewFilterLabels[filter]}.`}
          </p>
        </div>
        {!opened.scopeConfirmed ? (
          <Notice tone="warning" id="review-scope-warning" announce="polite">
            Escopo da norma a confirmar: EaD, qualificação e pós-graduação dependem de calendário
            próprio. Confirme o escopo antes de avaliar pelas regras abaixo.
          </Notice>
        ) : null}
        {!opened.sameYear ? (
          <Notice tone="warning" id="review-year-warning" announce="polite">
            Referência: Parecer SEI 3959640 ({opened.source.year}), páginas 1 e 2. Confira a norma
            aplicável a {opened.calendar.year}.
          </Notice>
        ) : null}
        <ul id="review-items" className="records">
          {opened.criteria.map((criterion, index) => (
            <ReviewCriterion
              key={criterion.id}
              calendarYear={opened.calendar.year}
              criterion={criterion}
              number={index + 1}
              entry={draft.entries.find((entry) => entry.id === criterion.id) || criterion.initial}
              changed={Boolean(draft.changed[criterion.id])}
              busy={busy || readOnly}
              hidden={filter !== 'all' && !listed.has(criterion.id)}
              onChange={(field, value) => changeEntry(criterion.id, field, value)}
            />
          ))}
        </ul>
        {filter !== 'all' && listed.size === 0 ? (
          <p className="help" data-review-empty>
            Nenhum critério nesta situação: {reviewFilterLabels[filter]}.
          </p>
        ) : null}
        {opened.notEvaluated.length ? (
          <details className="review-not-evaluated">
            <summary>O que a revisão não avalia</summary>
            <ul>
              {opened.notEvaluated.map((device) => (
                <li key={device}>{device}</li>
              ))}
            </ul>
          </details>
        ) : null}
        <section className="review-conclusion" aria-labelledby="review-conclusion-title">
          <div className="review-conclusion__heading">
            <div>
              <h3 id="review-conclusion-title">Conclusão</h3>
              <p className="help" id="review-conclusion-help">
                {conclusionEditable
                  ? 'Edite o texto; o encaminhamento ao fim continua acompanhando as avaliações.'
                  : 'Texto proposto; o encaminhamento ao fim acompanha cada avaliação.'}
              </p>
            </div>
            {conclusionEditable ? null : (
              <Button
                type="button"
                id="edit-conclusion"
                variant="secondary"
                disabled={busy || readOnly}
                onClick={onEditConclusion}
              >
                <Pencil size={16} aria-hidden="true" /> Editar texto
              </Button>
            )}
          </div>
          <label>
            <span className="visually-hidden">Conclusão do parecer</span>
            <textarea
              id="review-conclusion"
              ref={conclusionRef}
              aria-describedby="review-conclusion-help"
              disabled={!conclusionEditable || busy || readOnly}
              maxLength={8000}
              rows={5}
              value={draft.conclusion}
              onChange={(event) => changeField('conclusion', event.target.value)}
            />
          </label>
        </section>
        {opened.stale ? (
          <label id="review-stale-label" className="check">
            <input
              id="review-stale"
              type="checkbox"
              required
              disabled={busy || readOnly}
              checked={draft.acknowledgeStale}
              onChange={(event) => changeField('acknowledgeStale', event.target.checked)}
            />
            Reavaliei as conclusões anteriores considerando a nova versão do calendário/base.
          </label>
        ) : null}
      </form>
      <FormFeedback error={error} />
      {/* What is exported is what is read: the saved parecer, retired by any new edit. */}
      {preview ? (
        <section className="review-preview-panel" aria-labelledby="review-preview-title">
          <div className="review-preview-toolbar">
            <h3 id="review-preview-title">Parecer salvo</h3>
            <div className="actions">
              <Button
                type="button"
                id="copy-review"
                disabled={busy}
                onClick={() => {
                  void exportReview('copy');
                }}
              >
                <Copy size={18} aria-hidden="true" /> Copiar
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
                <FileCode2 size={18} aria-hidden="true" /> Baixar HTML
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
                <FileText size={18} aria-hidden="true" /> Baixar TXT
              </Button>
              <Button
                type="button"
                id="close-review-preview"
                variant="secondary"
                onClick={closePreview}
              >
                <X size={18} aria-hidden="true" /> Fechar
              </Button>
            </div>
          </div>
          <ReviewPreview document={preview} previewRef={previewRef} />
        </section>
      ) : null}
      <p className="help review-disclaimer">
        A revisão apoia o parecer; assinatura e tramitação ocorrem no SEI. Não constitui aprovação
        institucional. Confira a formatação ao colar no SEI.
      </p>
      <div className="review-bar">
        <div className="review-save-status" role="status">
          {heldBy
            ? `Parecer com ${heldBy}: assuma-o para alterar.`
            : readOnly
              ? 'Parecer em consulta: só pode ser alterado com o calendário enviado ou em revisão.'
              : dirty
                ? 'Há alterações por salvar.'
                : opened.review
                  ? 'Todas as alterações foram salvas.'
                  : 'O parecer ainda não foi salvo.'}
        </div>
        <div className="actions">
          {/* Nothing to read or export until a review is saved; locked, reading it is what remains. */}
          {opened.review ? (
            <Button
              type="button"
              id="preview-review"
              variant={locked ? 'primary' : 'secondary'}
              disabled={busy}
              onClick={() => {
                void exportReview('preview');
              }}
            >
              <Eye size={18} aria-hidden="true" /> Visualizar
            </Button>
          ) : null}
          {locked ? null : (
            <Button
              type="submit"
              form="review-form"
              // Secondary with nothing to save, leaving the emphasis to the next step of the flow.
              variant={dirty || !opened.review ? 'primary' : 'secondary'}
              disabled={busy || readOnly}
            >
              <Save size={18} aria-hidden="true" /> {pending === 'save' ? 'Salvando…' : 'Salvar'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
