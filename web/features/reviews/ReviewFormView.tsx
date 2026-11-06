import { useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { ChevronDown, Copy, Download, Eye, FileCode2, FileText, Pencil, Save } from 'lucide-react';
import { ActionMenu, ActionMenuItem } from '../../components/ui/ActionMenu.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { ChoiceGroup } from '../../components/ui/ChoiceGroup.tsx';
import { TextField } from '../../components/ui/Field.tsx';
import ReviewCriterion from './ReviewCriterion.tsx';
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
}: Props) {
  const opened = draft.opened;
  const dirty = draft.dirty;
  const pendingIds = () =>
    new Set(draft.entries.filter((entry) => entry.status === 'PENDENTE').map((entry) => entry.id));
  const toAssess = pendingIds().size;
  const [filter, setFilter] = useState<'all' | 'pending'>('all');
  // The filtered list holds still until the filter changes or the parecer is saved, so choosing an
  // assessment never takes a criterion away before its observation is written.
  const [listed, setListed] = useState<ReadonlySet<string>>(new Set());
  // `opened` changes whenever the form is reset: on saving and on what another session changed.
  const [listedFor, setListedFor] = useState(opened);
  if (listedFor !== opened) {
    setListedFor(opened);
    setListed(pendingIds());
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
          <ChoiceGroup
            className="review-filter"
            label="Mostrar critérios"
            value={filter}
            options={[
              { value: 'all', label: `Todos (${opened.criteria.length})` },
              { value: 'pending', label: `A avaliar (${toAssess})` },
            ]}
            onValueChange={(value) => {
              setFilter(value);
              setListed(pendingIds());
            }}
          />
          <p className="visually-hidden" role="status">
            {filter === 'pending'
              ? `Mostrando ${listed.size} de ${opened.criteria.length} critérios.`
              : `Mostrando ${opened.criteria.length} critérios.`}
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
              hidden={filter === 'pending' && !listed.has(criterion.id)}
              onChange={(field, value) => changeEntry(criterion.id, field, value)}
            />
          ))}
        </ul>
        {filter === 'pending' && listed.size === 0 ? (
          <p className="help" data-review-empty>
            Nenhum critério a avaliar.
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
        <Button
          type="button"
          id="edit-conclusion"
          variant="secondary"
          disabled={busy || readOnly}
          onClick={onEditConclusion}
        >
          <Pencil size={16} aria-hidden="true" /> Editar texto do parecer
        </Button>
        <label>
          Conclusão do parecerista — texto proposto
          <textarea
            id="review-conclusion"
            ref={conclusionRef}
            disabled={!conclusionEditable || busy || readOnly}
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
              disabled={busy || readOnly}
              checked={draft.acknowledgeStale}
              onChange={(event) => changeField('acknowledgeStale', event.target.checked)}
            />
            Reavaliei as conclusões anteriores considerando a nova versão do calendário/base.
          </label>
        ) : null}
      </form>
      <FormFeedback error={error} />
      <ReviewPreview document={preview} previewRef={previewRef} />
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
          {/* Nothing to read or export until a review is saved. */}
          {opened.review ? (
            <>
              <Button
                type="button"
                id="preview-review"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  void exportReview('preview');
                }}
              >
                <Eye size={18} aria-hidden="true" /> Visualizar
              </Button>
              <ActionMenu
                disabled={busy}
                trigger={
                  <>
                    <Download size={18} aria-hidden="true" /> Exportar
                    <ChevronDown size={16} aria-hidden="true" />
                  </>
                }
              >
                {locked ? null : (
                  <ActionMenuItem id="copy-review" onClick={() => void exportReview('copy')}>
                    <Copy size={18} aria-hidden="true" /> Copiar para o SEI
                  </ActionMenuItem>
                )}
                <ActionMenuItem id="download-review-html" onClick={() => void exportReview('html')}>
                  <FileCode2 size={18} aria-hidden="true" /> Baixar HTML
                </ActionMenuItem>
                <ActionMenuItem id="download-review-txt" onClick={() => void exportReview('txt')}>
                  <FileText size={18} aria-hidden="true" /> Baixar TXT
                </ActionMenuItem>
              </ActionMenu>
              {/* With nothing left to save, copying to the SEI is what remains to do here. */}
              {locked ? (
                <Button
                  type="button"
                  id="copy-review"
                  disabled={busy}
                  onClick={() => {
                    void exportReview('copy');
                  }}
                >
                  <Copy size={18} aria-hidden="true" /> Copiar para o SEI
                </Button>
              ) : null}
            </>
          ) : null}
          {locked ? null : (
            <Button
              type="submit"
              form="review-form"
              // Secondary with nothing to save, leaving the emphasis to the next step of the flow.
              variant={dirty || !opened.review ? 'primary' : 'secondary'}
              disabled={busy || readOnly}
            >
              <Save size={18} aria-hidden="true" />{' '}
              {pending === 'save' ? 'Salvando parecer…' : 'Salvar parecer'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
