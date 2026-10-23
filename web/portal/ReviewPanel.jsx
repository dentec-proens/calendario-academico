import { useEffect, useRef, useState } from 'react';
import { CheckCheck, ClipboardCopy, Download, ExternalLink, Eye, Pencil, Save } from 'lucide-react';
import { modalityLabels } from '../../src/modalities.mjs';
import { updateConclusion } from '../../src/review-conclusion.mjs';
import { reviewNorm, presentReviewText } from '../../src/review-presentation.mjs';
import { api } from './api.ts';
import { useQuery } from 'convex/react';
import { functions } from '../native/client.ts';

const statusLabels = {
  PENDENTE: 'Pendente de análise',
  ATENDIDO: 'Atendido',
  NAO_ATENDIDO: 'Não atendido',
  NAO_APLICAVEL: 'Não aplicável',
};

function initialDraft(opened) {
  const entries = opened.criteria.map((criterion) => {
    const saved = opened.review?.entries.find((entry) => entry.id === criterion.id);
    const prior = saved || criterion.initial;
    return {
      id: criterion.id,
      status: prior.status,
      notes: saved?.reviewed === false && saved?.finding ? '' : saved?.notes || '',
      reviewed: saved?.reviewed === true && saved.status !== 'PENDENTE',
    };
  });
  const previousConclusion = opened.review?.conclusion || opened.initialConclusion;
  const conclusion = updateConclusion(
    presentReviewText(previousConclusion, opened.calendar.year),
    opened.criteria,
    entries,
    reviewNorm(opened.calendar.year, opened.sameYear ? opened.source.norm : ''),
  );
  return {
    opened,
    entries,
    conclusion,
    processNumber: opened.review?.processNumber || '',
    applicableNorm:
      presentReviewText(opened.review?.applicableNorm, opened.calendar.year) ||
      reviewNorm(opened.calendar.year, opened.sameYear ? opened.source.norm : ''),
    acknowledgeStale: false,
    editing: {},
    changed: {},
    conclusionEditable: false,
    dirty: conclusion !== previousConclusion,
  };
}

function ReviewCriterion({
  criterion,
  entry,
  editing,
  changed,
  busy,
  onEdit,
  onChange,
  onConfirm,
}) {
  const selectRef = useRef(null);
  useEffect(() => {
    if (editing) selectRef.current?.focus();
  }, [editing]);
  const origin = entry.reviewed
    ? 'Avaliação conferida pelo parecerista'
    : changed
      ? entry.status === 'PENDENTE'
        ? 'Pendente de análise'
        : 'Alteração aguardando confirmação'
      : 'Análise inicial automática — aguardando conferência';

  return (
    <li className="review-item">
      <h3>{criterion.title}</h3>
      <p>
        <strong>Indicação do sistema:</strong> {criterion.signal}
      </p>
      {criterion.candidates.length > 0 ? (
        <details>
          <summary>
            Ver registros possivelmente relacionados ({criterion.candidates.length})
          </summary>
          <ul>
            {criterion.candidates.map((candidate, index) => (
              <li key={candidate.id || index}>
                {candidate.start} a {candidate.end} · {candidate.name}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <p data-origin={criterion.id}>{origin}</p>
      <div className="actions">
        <button
          type="button"
          className="secondary"
          data-edit-criterion={criterion.id}
          disabled={busy}
          onClick={onEdit}
        >
          <Pencil size={16} aria-hidden="true" /> Editar
        </button>
        <button
          type="button"
          className="secondary"
          data-confirm-criterion={criterion.id}
          disabled={busy || entry.status === 'PENDENTE'}
          onClick={onConfirm}
        >
          <CheckCheck size={16} aria-hidden="true" /> Confirmar leitura e análise
        </button>
      </div>
      <fieldset disabled={!editing || busy} data-fields={criterion.id}>
        <label>
          Situação proposta / avaliação
          <select
            ref={selectRef}
            data-criterion={criterion.id}
            value={entry.status}
            onChange={(event) => onChange('status', event.target.value)}
          >
            {Object.entries(statusLabels).map(([status, label]) => (
              <option key={status} value={status}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Observações (opcional)
          <textarea
            data-notes={criterion.id}
            maxLength={2000}
            rows={3}
            placeholder="Se necessário, descreva o ajuste ou a orientação ao campus."
            value={entry.notes}
            onChange={(event) => onChange('notes', event.target.value)}
          />
        </label>
      </fieldset>
    </li>
  );
}

function ReviewPreview({ document, previewRef }) {
  if (!document) return null;
  // Only /api/reviews/:id/export supplies this body. review-export.mjs escapes
  // every user field before adding its fixed article/table markup. The preview
  // uses portal.css; inline styles are retained only for downloads/clipboard.
  const body = document.body.replace(/ style="[^"]*"/g, '');
  return <div id="review-preview" ref={previewRef} dangerouslySetInnerHTML={{ __html: body }} />;
}

function downloadDocument(document, draft, format) {
  const html = format === 'html';
  const url = URL.createObjectURL(
    new Blob([html ? document.html : document.text], {
      type: html ? 'text/html;charset=utf-8' : 'text/plain;charset=utf-8',
    }),
  );
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = `parecer-${draft.opened.calendar.year}-revisao-${draft.opened.review.revision}.${format}`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function ReviewContent({ calendars, liveReview, onOpened }) {
  const [selectedCalendar, setSelectedCalendar] = useState('');
  const [draft, setDraft] = useState(null);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState('');
  const [operationCalendarId, setOperationCalendarId] = useState('');
  const [previousCalendars, setPreviousCalendars] = useState(calendars);
  const [previousLiveReview, setPreviousLiveReview] = useState(liveReview);
  const [preview, setPreview] = useState(null);
  const previewRef = useRef(null);
  const conclusionRef = useRef(null);
  const actionPending = useRef(false);
  const operationRef = useRef(null);
  const calendarId = calendars.some((calendar) => calendar.id === selectedCalendar)
    ? selectedCalendar
    : calendars[0]?.id || '';
  const openedCalendarId = draft?.opened.calendar.id;
  const busy = Boolean(pending);
  const dirty = draft?.dirty === true;

  // Reconcile a new subscription snapshot before committing the view. This
  // avoids rendering stale fields first and cascading through a sync effect.
  if (liveReview !== previousLiveReview) {
    setPreviousLiveReview(liveReview);
    if (liveReview && draft && liveReview.calendar.id === draft.opened.calendar.id) {
      const prior = draft.opened;
      const changed =
        liveReview.calendar.version !== prior.calendar.version ||
        liveReview.catalogueRevision !== prior.catalogueRevision ||
        (liveReview.review?.revision || 0) !== (prior.review?.revision || 0);
      if (changed) {
        setPreview(null);
        if (dirty || busy) {
          setMessage(
            'O calendário, a base institucional ou a revisão mudou em outra sessão. Suas alterações foram preservadas. Salve uma cópia das observações e reabra a análise para conferir a versão atual.',
          );
        } else {
          setDraft(initialDraft(liveReview));
          setMessage('A análise foi atualizada com as alterações recebidas de outra sessão.');
        }
      }
    }
  }

  if (calendars !== previousCalendars) {
    setPreviousCalendars(calendars);
    const removedOpened =
      openedCalendarId && !calendars.some((calendar) => calendar.id === openedCalendarId);
    const removedOperation =
      operationCalendarId && !calendars.some((calendar) => calendar.id === operationCalendarId);
    if (removedOpened || removedOperation) {
      if (removedOpened) {
        setDraft(null);
        setPreview(null);
      }
      if (removedOperation) {
        setOperationCalendarId('');
        setPending('');
      }
      setMessage(
        'O calendário deixou de estar disponível para revisão. Selecione outro calendário para abrir a análise.',
      );
    }
  }

  useEffect(() => {
    if (!dirty) return;

    function beforeUnload(event) {
      event.preventDefault();
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (preview) previewRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [preview]);

  useEffect(() => {
    if (draft?.conclusionEditable) conclusionRef.current?.focus();
  }, [draft?.conclusionEditable]);

  useEffect(() => {
    if (
      operationRef.current &&
      !calendars.some((calendar) => calendar.id === operationRef.current.calendarId)
    ) {
      // Invalidate pending asynchronous results as soon as access is revoked.
      operationRef.current = null;
      actionPending.current = false;
    }
  }, [calendars]);

  function notify(text) {
    setMessage(`${new Date().toLocaleTimeString('pt-BR')} — ${text}`);
  }

  function beginOperation(calendarId, kind) {
    const operation = { calendarId };
    operationRef.current = operation;
    actionPending.current = true;
    setOperationCalendarId(calendarId);
    setPending(kind);
    return operation;
  }

  function finishOperation(operation) {
    if (operationRef.current !== operation) return;
    operationRef.current = null;
    actionPending.current = false;
    setPending('');
    setOperationCalendarId('');
  }

  function changeField(field, value) {
    setDraft((current) => {
      const next = { ...current, [field]: value, dirty: true };
      return {
        ...next,
        conclusion: updateConclusion(
          next.conclusion,
          next.opened.criteria,
          next.entries,
          reviewNorm(
            next.opened.calendar.year,
            next.opened.sameYear ? next.opened.source.norm : '',
          ),
        ),
      };
    });
  }

  function changeEntry(id, field, value) {
    setDraft((current) => {
      const entries = current.entries.map((entry) =>
        entry.id === id ? { ...entry, [field]: value, reviewed: false } : entry,
      );
      return {
        ...current,
        entries,
        changed: { ...current.changed, [id]: true },
        conclusion: updateConclusion(
          current.conclusion,
          current.opened.criteria,
          entries,
          reviewNorm(
            current.opened.calendar.year,
            current.opened.sameYear ? current.opened.source.norm : '',
          ),
        ),
        dirty: true,
      };
    });
  }

  function confirmEntry(id) {
    setDraft((current) => {
      const entries = current.entries.map((entry) =>
        entry.id === id && entry.status !== 'PENDENTE' ? { ...entry, reviewed: true } : entry,
      );
      return {
        ...current,
        entries,
        conclusion: updateConclusion(
          current.conclusion,
          current.opened.criteria,
          entries,
          reviewNorm(
            current.opened.calendar.year,
            current.opened.sameYear ? current.opened.source.norm : '',
          ),
        ),
        dirty: true,
      };
    });
  }

  async function openReview() {
    if (actionPending.current) return;
    if (
      dirty &&
      !window.confirm('Há observações não salvas. Deseja descartá-las e abrir outra revisão?')
    )
      return;
    if (!calendarId) {
      notify('Selecione um calendário.');
      return;
    }
    const operation = beginOperation(calendarId, 'open');
    try {
      const opened = await api(`/api/reviews/${encodeURIComponent(calendarId)}`);
      if (operationRef.current !== operation) return;
      setDraft(initialDraft(opened));
      onOpened?.(calendarId);
      setPreview(null);
      notify(
        'Análise inicial preenchida. Use Editar para corrigir um item ou Confirmar leitura e análise para registrar sua conferência. Salve antes de baixar.',
      );
    } catch (error) {
      if (operationRef.current === operation) notify(error.message);
    } finally {
      finishOperation(operation);
    }
  }

  async function saveReview(event) {
    event.preventDefault();
    if (actionPending.current || !draft) return;
    const operation = beginOperation(draft.opened.calendar.id, 'save');
    try {
      const { opened } = draft;
      const path = `/api/reviews/${encodeURIComponent(opened.calendar.id)}`;
      await api(path, 'PUT', {
        entries: draft.entries,
        conclusion: draft.conclusion,
        processNumber: draft.processNumber,
        applicableNorm: draft.applicableNorm,
        revision: opened.review?.revision || 0,
        calendarVersion: opened.calendar.version,
        catalogueRevision: opened.catalogueRevision,
        acknowledgeStale: draft.acknowledgeStale,
      });
      if (operationRef.current !== operation) return;
      const updated = await api(path);
      if (operationRef.current !== operation) return;
      setDraft(initialDraft(updated));
      setPreview(null);
      notify(
        'Revisão humana salva com autoria e versão do calendário. Não constitui aprovação oficial.',
      );
    } catch (error) {
      if (operationRef.current === operation) notify(error.message);
    } finally {
      finishOperation(operation);
    }
  }

  async function exportReview(action) {
    if (actionPending.current) return;
    if (!draft) {
      notify('Abra a análise de um calendário.');
      return;
    }
    if (dirty || !draft.opened.review) {
      notify('Salve a análise antes de visualizar, copiar ou baixar o parecer.');
      return;
    }
    const operation = beginOperation(draft.opened.calendar.id, 'export');
    try {
      const document = await api(
        `/api/reviews/${encodeURIComponent(draft.opened.calendar.id)}/export`,
        'POST',
        { revision: draft.opened.review.revision },
      );
      if (operationRef.current !== operation) return;
      if (action === 'preview') {
        setPreview(document);
        notify('Parecer disponível abaixo para leitura e seleção do texto.');
      } else if (action === 'html' || action === 'txt') {
        downloadDocument(document, draft, action);
        notify('Download solicitado. Confira a minuta e a formatação antes de inserir no SEI.');
      } else if (action === 'copy') {
        setPreview(document);
        try {
          if (window.ClipboardItem && navigator.clipboard?.write) {
            await navigator.clipboard.write([
              new window.ClipboardItem({
                'text/html': new Blob([document.body], { type: 'text/html' }),
                'text/plain': new Blob([document.text], { type: 'text/plain' }),
              }),
            ]);
          } else {
            await navigator.clipboard.writeText(document.text);
          }
          if (operationRef.current === operation)
            notify('Parecer copiado. Cole no editor do SEI e confira a tabela e o texto.');
        } catch {
          if (operationRef.current === operation)
            notify(
              'O navegador não permitiu copiar automaticamente. Selecione o parecer exibido abaixo e use Ctrl+C, ou baixe o HTML.',
            );
        }
      }
    } catch (error) {
      if (operationRef.current === operation) notify(error.message);
    } finally {
      finishOperation(operation);
    }
  }

  const opened = draft?.opened;
  const reviewedCount = draft?.entries.filter((entry) => entry.reviewed).length || 0;
  return (
    <section id="review-panel" className="page" aria-busy={busy}>
      <div className="panel">
        <h2>Revisão técnico-pedagógica · DENTEC/PROENS</h2>
        <p>
          Critérios identificados no Parecer SEI 3959640, páginas 1 e 2. As indicações automáticas
          são apoio; cada conclusão é registrada pelo revisor.
        </p>
        <label>
          Calendário para revisão
          <select
            id="review-calendar"
            value={calendarId}
            disabled={busy || !calendars.length}
            onChange={(event) => setSelectedCalendar(event.target.value)}
          >
            {calendars.map((calendar) => (
              <option key={calendar.id} value={calendar.id}>
                {calendar.name} · {calendar.year} ·{' '}
                {(calendar.modalities || [calendar.offer])
                  .map((modality) => modalityLabels[modality] || modality)
                  .join(' + ')}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          id="open-review"
          disabled={busy || !calendars.length}
          onClick={openReview}
        >
          <Eye size={18} aria-hidden="true" />{' '}
          {pending === 'open' ? 'Abrindo análise…' : 'Gerar / abrir análise inicial'}
        </button>
        <p id="review-message" role="status" aria-live="polite">
          {message || (!calendars.length ? 'Nenhum calendário disponível para revisão.' : '')}
        </p>
        {opened ? (
          <div id="review-content">
            <h3 id="review-heading">
              {opened.calendar.campus} · {opened.calendar.name}
            </h3>
            <p id="review-progress">
              {opened.criteria.length} critérios analisados inicialmente pelo sistema ·{' '}
              {reviewedCount} conferidos pelo parecerista. Isso não representa aprovação
              institucional.
            </p>
            <p id="review-conflicts">
              {opened.conflicts.length
                ? `${opened.conflicts.length} conflito(s) de inclusão/exclusão: ${opened.conflicts.map((conflict) => conflict.date).join(', ')}. Confira no editor.`
                : opened.countError ||
                  'Nenhum conflito de inclusão/exclusão identificado pelo cálculo disponível. Isso não é uma validação integral.'}
            </p>
            <p id="review-author">
              {opened.review
                ? `Último registro: ${opened.review.reviewer.name} · ${new Date(opened.review.updatedAt).toLocaleString('pt-BR')} · Revisão ${opened.review.revision}${opened.stale ? ' — DESATUALIZADA: calendário ou base institucional mudou.' : ''}`
                : 'Ainda não há revisão humana registrada.'}
            </p>
            <a
              id="review-editor"
              href={`/editor?id=${encodeURIComponent(opened.calendar.id)}`}
              target="_blank"
              rel="noopener"
            >
              <ExternalLink size={16} aria-hidden="true" /> Abrir calendário em outra aba
            </a>
            <div className="actions review-export-actions">
              <button
                type="button"
                id="preview-review"
                disabled={busy}
                onClick={() => exportReview('preview')}
              >
                <Eye size={18} aria-hidden="true" /> Visualizar parecer
              </button>
              <button
                type="button"
                id="download-review-html"
                disabled={busy}
                onClick={() => exportReview('html')}
              >
                <Download size={18} aria-hidden="true" /> Baixar parecer para SEI (HTML)
              </button>
              <button
                type="button"
                id="download-review-txt"
                disabled={busy}
                onClick={() => exportReview('txt')}
              >
                <Download size={18} aria-hidden="true" /> Baixar texto
              </button>
              <button
                type="button"
                id="copy-review"
                disabled={busy}
                onClick={() => exportReview('copy')}
              >
                <ClipboardCopy size={18} aria-hidden="true" /> Copiar parecer para SEI
              </button>
              <button type="submit" form="review-form" disabled={busy}>
                <Save size={18} aria-hidden="true" />{' '}
                {pending === 'save' ? 'Salvando análise…' : 'Salvar análise / revisão'}
              </button>
            </div>
            <form id="review-form" onSubmit={saveReview}>
              <div className="row-form">
                <label>
                  Processo SEI nº
                  <input
                    id="review-process"
                    maxLength={100}
                    placeholder="Informe o número do processo"
                    disabled={busy}
                    value={draft.processNumber}
                    onChange={(event) => changeField('processNumber', event.target.value)}
                  />
                </label>
                <label>
                  Norma vigente do ano analisado
                  <input
                    id="review-norm"
                    maxLength={1000}
                    placeholder="Resolução e identificação oficial"
                    disabled={busy}
                    value={draft.applicableNorm}
                    onChange={(event) => changeField('applicableNorm', event.target.value)}
                  />
                </label>
              </div>
              <ul id="review-items" className="records">
                {opened.criteria.map((criterion, index) => (
                  <ReviewCriterion
                    key={criterion.id}
                    criterion={criterion}
                    entry={draft.entries[index]}
                    editing={Boolean(draft.editing[criterion.id])}
                    changed={Boolean(draft.changed[criterion.id])}
                    busy={busy}
                    onEdit={() =>
                      setDraft((current) => ({
                        ...current,
                        editing: { ...current.editing, [criterion.id]: true },
                      }))
                    }
                    onChange={(field, value) => changeEntry(criterion.id, field, value)}
                    onConfirm={() => confirmEntry(criterion.id)}
                  />
                ))}
              </ul>
              <button
                type="button"
                id="edit-conclusion"
                className="secondary"
                disabled={busy}
                onClick={() => setDraft((current) => ({ ...current, conclusionEditable: true }))}
              >
                <Pencil size={16} aria-hidden="true" /> Editar texto do parecer
              </button>
              <label>
                2. Parecer — texto proposto e conclusão do parecerista
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
                Este registro é apoio à revisão. Não emite parecer assinado nem declara aprovação
                oficial. Para marcar Atendido, Não atendido ou Não aplicável, informe a evidência ou
                justificativa.
              </p>
              <button disabled={busy}>
                <Save size={18} aria-hidden="true" />{' '}
                {pending === 'save' ? 'Salvando análise…' : 'Salvar análise / revisão'}
              </button>
            </form>
            <p className="help">
              Salve antes de exportar. O HTML mantém a tabela para copiar no editor do SEI; o texto
              simples é uma alternativa. Confira a formatação após colar. Assinatura e tramitação
              ocorrem no SEI.
            </p>
            <ReviewPreview document={preview} previewRef={previewRef} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default function ReviewPanel(props) {
  const [openedId, setOpenedId] = useState(null);
  const available = props.calendars.some((calendar) => calendar.id === openedId);
  const liveReview = useQuery(
    functions.native.read,
    openedId && available ? { path: `/api/reviews/${encodeURIComponent(openedId)}` } : 'skip',
  );
  return <ReviewContent {...props} liveReview={liveReview} onOpened={setOpenedId} />;
}
