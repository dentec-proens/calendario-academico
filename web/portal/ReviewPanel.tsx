import { scrollIntoView } from '../scroll.ts';
import { Button } from '../components/ui/Button.tsx';
import type { RefObject, FormEvent } from 'react';
import type { Bootstrap } from '../native/types.ts';
import type { Id } from '../../convex/_generated/dataModel.js';
import type { PaginationState } from './Pagination.tsx';
import { nativeError } from '../native/client.ts';
type ReviewSupport = Awaited<ReturnType<typeof reviews.get>>;
type ReviewEntry = Parameters<typeof reviews.save>[1]['entries'][number];
type ReviewDocument = Awaited<ReturnType<typeof reviews.export>>;
type Draft = ReturnType<typeof initialDraft>;
type Operation = { calendarId: Id<'calendars'> };
import { confirmAction } from '../components/confirmation.ts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardCopy, Download, ExternalLink, Eye, Pencil, Save } from 'lucide-react';
import { calendarName } from '../../src/calendar-label.ts';
import { modalityLabels } from '../../src/modalities.ts';
import { updateConclusion } from '../../src/review-conclusion.ts';
import { reviewNorm } from '../../src/review-presentation.ts';
import { reviews } from '../native/client.ts';
import { usePaginatedQuery, useQueries, type RequestForQueries } from 'convex/react';
import { functions } from '../native/client.ts';
import Pagination from './Pagination.tsx';
import ReviewCriterion from './ReviewCriterion.tsx';
import { TextField } from '../components/ui/Field.tsx';
import { editorUrl } from '../../src/app-routes.ts';
import { navigateApp, useAppLocation } from '../routing.tsx';

function initialDraft(opened: ReviewSupport) {
  const entries = opened.criteria.map((criterion) => {
    const saved = opened.review?.entries.find((entry) => entry.id === criterion.id);
    const prior = saved || criterion.initial;
    return {
      id: criterion.id,
      status: prior.status,
      notes:
        saved?.reviewed === false && 'finding' in saved && saved.finding ? '' : saved?.notes || '',
      reviewed: saved?.reviewed === true && saved.status !== 'PENDENTE',
    };
  });
  const previousConclusion = opened.review?.conclusion || opened.initialConclusion;
  const conclusion = opened.review
    ? previousConclusion
    : updateConclusion(
        previousConclusion,
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
      opened.review?.applicableNorm ||
      reviewNorm(opened.calendar.year, opened.sameYear ? opened.source.norm : ''),
    acknowledgeStale: false,
    changed: {} as Record<string, boolean>,
    conclusionEditable: false,
    dirty: conclusion !== previousConclusion,
  };
}

function ReviewPreview({
  document,
  previewRef,
}: {
  document: ReviewDocument | null;
  previewRef: RefObject<HTMLDivElement | null>;
}) {
  if (!document) return null;
  // Only the server's review export supplies this body. review-export.ts escapes
  // every user field before adding its fixed article/table markup. The preview
  // uses portal.css; inline styles are retained only for downloads/clipboard.
  const body = document.body.replace(/ style="[^"]*"/g, '');
  return <div id="review-preview" ref={previewRef} dangerouslySetInnerHTML={{ __html: body }} />;
}

function downloadDocument(document: ReviewDocument, draft: Draft, format: 'html' | 'txt') {
  const html = format === 'html';
  const url = URL.createObjectURL(
    new Blob([html ? document.html : document.text], {
      type: html ? 'text/html;charset=utf-8' : 'text/plain;charset=utf-8',
    }),
  );
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = `parecer-${draft.opened.calendar.year}-revisao-${draft.opened.review!.revision}.${format}`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function ReviewContent({
  calendars,
  liveReview,
  onOpened,
  pagination,
  routeCalendarId,
  routeKey,
  routeUnavailable = false,
  onRouteCalendar,
}: {
  calendars: Bootstrap['calendars'];
  liveReview: ReviewSupport | undefined;
  onOpened: (id: Id<'calendars'>) => void;
  pagination: PaginationState;
  routeCalendarId?: string;
  routeKey?: string;
  routeUnavailable?: boolean;
  onRouteCalendar?: (id: string | null) => void;
}) {
  const [selectedCalendar, setSelectedCalendar] = useState<Id<'calendars'> | ''>(
    () => (routeCalendarId || '') as Id<'calendars'> | '',
  );
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState('');
  const [operationCalendarId, setOperationCalendarId] = useState('');
  const [previousCalendars, setPreviousCalendars] = useState(calendars);
  const [previousLiveReview, setPreviousLiveReview] = useState(liveReview);
  const [previousOpened, setPreviousOpened] = useState<ReviewSupport | undefined>(undefined);
  const [previousRoute, setPreviousRoute] = useState({ id: routeCalendarId, key: routeKey });
  const [draftCache, setDraftCache] = useState(() => new Map<string, Draft>());
  const [removedCalendarId, setRemovedCalendarId] = useState('');
  const [previousUnavailable, setPreviousUnavailable] = useState(routeUnavailable);
  const [preview, setPreview] = useState<ReviewDocument | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const conclusionRef = useRef<HTMLTextAreaElement>(null);
  const actionPending = useRef(false);
  const operationRef = useRef<Operation | null>(null);
  const routeVersion = useRef(0);
  const routed = routeCalendarId !== undefined;
  const calendarId =
    calendars.some((calendar) => calendar.id === selectedCalendar) ||
    (routed && !!routeCalendarId && selectedCalendar === routeCalendarId)
      ? selectedCalendar
      : calendars[0]?.id || '';
  const openedCalendarId = draft?.opened.calendar.id;
  const routeLoading = Boolean(routeCalendarId && !draft && !message);
  const busy = Boolean(pending) || routeLoading;
  const dirty = draft?.dirty === true;

  // Reconcile a new subscription snapshot before committing the view. This
  // avoids rendering stale fields first and cascading through a sync effect.
  if (previousRoute.id !== routeCalendarId || previousRoute.key !== routeKey) {
    setPreviousRoute({ id: routeCalendarId, key: routeKey });
    const cached = new Map(draftCache);
    if (draft) cached.set(draft.opened.calendar.id, draft);
    setDraftCache(cached);
    setDraft(routeCalendarId ? cached.get(routeCalendarId) || null : null);
    if (routeCalendarId) setSelectedCalendar(routeCalendarId as Id<'calendars'>);
    setPreview(null);
    setPending('');
    setOperationCalendarId('');
    setMessage('');
  }

  if (previousUnavailable !== routeUnavailable) {
    setPreviousUnavailable(routeUnavailable);
    setRemovedCalendarId(routeUnavailable ? routeCalendarId || '' : '');
    if (routeUnavailable) {
      setDraft(null);
      setPreview(null);
      setPending('');
      setOperationCalendarId('');
      setDraftCache((cached) => {
        const next = new Map(cached);
        if (routeCalendarId) next.delete(routeCalendarId);
        return next;
      });
      setMessage(
        'O calendário deixou de estar disponível para revisão. Selecione outro calendário para abrir a análise.',
      );
    }
  }

  if (liveReview !== previousLiveReview || draft?.opened !== previousOpened) {
    setPreviousLiveReview(liveReview);
    setPreviousOpened(draft?.opened);
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

  if (calendars !== previousCalendars && pagination.status === 'Exhausted') {
    setPreviousCalendars(calendars);
    const removedCachedIds = Array.from(draftCache.keys()).filter(
      (id) =>
        previousCalendars.some((calendar) => calendar.id === id) &&
        !calendars.some((calendar) => calendar.id === id),
    );
    if (removedCachedIds.length)
      setDraftCache((cached) => {
        const next = new Map(cached);
        for (const id of removedCachedIds) next.delete(id);
        return next;
      });
    // A directly opened record need not appear on the loaded list page. Only a
    // record previously present in an exhausted list can be inferred removed.
    const removedOpened =
      openedCalendarId &&
      (!routed || previousCalendars.some((calendar) => calendar.id === openedCalendarId)) &&
      !calendars.some((calendar) => calendar.id === openedCalendarId);
    const removedOperation =
      operationCalendarId &&
      (!routed || previousCalendars.some((calendar) => calendar.id === operationCalendarId)) &&
      !calendars.some((calendar) => calendar.id === operationCalendarId);
    if (removedOpened || removedOperation) {
      if (removedOpened) {
        setDraftCache((cached) => {
          const next = new Map(cached);
          next.delete(openedCalendarId);
          return next;
        });
        setRemovedCalendarId(openedCalendarId);
        setDraft(null);
        setPreview(null);
      }
      if (removedOperation) {
        setRemovedCalendarId(operationCalendarId);
        setOperationCalendarId('');
        setPending('');
      }
      setMessage(
        'O calendário deixou de estar disponível para revisão. Selecione outro calendário para abrir a análise.',
      );
    }
  }

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (
        !dirty &&
        !Array.from(draftCache.values()).some(
          (cached) => cached.opened.calendar.id !== openedCalendarId && cached.dirty,
        )
      )
        return;
      event.preventDefault();
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty, draftCache, openedCalendarId]);

  useEffect(
    () => () => {
      operationRef.current = null;
      actionPending.current = false;
      routeVersion.current++;
    },
    [],
  );

  useEffect(() => {
    if (preview) scrollIntoView(previewRef.current, { behavior: 'smooth' });
  }, [preview]);

  useEffect(() => {
    if (draft?.conclusionEditable) conclusionRef.current?.focus();
  }, [draft?.conclusionEditable]);

  useEffect(() => {
    if (
      operationRef.current &&
      (operationRef.current.calendarId === removedCalendarId ||
        (!routed &&
          pagination.status === 'Exhausted' &&
          !calendars.some((calendar) => calendar.id === operationRef.current?.calendarId)))
    ) {
      // Invalidate pending asynchronous results as soon as access is revoked.
      operationRef.current = null;
      actionPending.current = false;
    }
  }, [calendars, pagination.status, routed, removedCalendarId]);

  function notify(text: string) {
    setMessage(`${new Date().toLocaleTimeString('pt-BR')} — ${text}`);
  }

  const beginOperation = useCallback((calendarId: Id<'calendars'>, kind: string) => {
    const operation = { calendarId };
    operationRef.current = operation;
    actionPending.current = true;
    setOperationCalendarId(calendarId);
    setPending(kind);
    return operation;
  }, []);

  const finishOperation = useCallback((operation: Operation) => {
    if (operationRef.current !== operation) return;
    operationRef.current = null;
    actionPending.current = false;
    setPending('');
    setOperationCalendarId('');
  }, []);

  useEffect(() => {
    if (routeCalendarId === undefined) return;
    routeVersion.current++;
    operationRef.current = null;
    actionPending.current = false;
    if (!routeCalendarId || routeUnavailable) return;
    const id = routeCalendarId as Id<'calendars'>;
    if (openedCalendarId === id) {
      onOpened(id);
      return;
    }
    const operation = { calendarId: id };
    operationRef.current = operation;
    actionPending.current = true;
    void Promise.resolve()
      .then(() => reviews.get(id))
      .then((opened) => {
        if (operationRef.current !== operation) return;
        if (opened.calendar.id !== id)
          throw new Error('O calendário solicitado não está disponível para revisão.');
        setDraft(initialDraft(opened));
        onOpened(id);
        setMessage('Indicações automáticas disponíveis para conferência.');
      })
      .catch((error: unknown) => {
        if (operationRef.current === operation) setMessage(nativeError(error).message);
      })
      .finally(() => finishOperation(operation));
    return () => {
      if (operationRef.current === operation) {
        operationRef.current = null;
        actionPending.current = false;
      }
    };
  }, [routeCalendarId, routeKey, routeUnavailable, openedCalendarId, onOpened, finishOperation]);

  function changeField<
    K extends 'conclusion' | 'processNumber' | 'applicableNorm' | 'acknowledgeStale',
  >(field: K, value: Draft[K]) {
    setDraft((current) => {
      if (!current) return current;
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

  function changeEntry<K extends 'status' | 'notes'>(id: string, field: K, value: ReviewEntry[K]) {
    setDraft((current) => {
      if (!current) return current;
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

  function confirmEntry(id: string) {
    setDraft((current) => {
      if (!current) return current;
      const entries = current.entries.map((entry) =>
        entry.id === id && entry.status !== 'PENDENTE' ? { ...entry, reviewed: true } : entry,
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

  async function openReview() {
    if (actionPending.current) return;
    const requestedVersion = routeVersion.current;
    const selectedCalendarId = calendarId;
    if (
      dirty &&
      !(await confirmAction({
        title: 'Descartar observações não salvas?',
        description: 'Abrir outra revisão descartará as observações que ainda não foram salvas.',
        consequence: 'As observações descartadas não poderão ser recuperadas.',
        intent: 'danger',
        confirmLabel: 'Descartar e abrir revisão',
        cancelLabel: 'Continuar editando',
      }))
    )
      return;
    if (actionPending.current || routeVersion.current !== requestedVersion) return;
    if (!selectedCalendarId) {
      notify('Selecione um calendário.');
      return;
    }
    const cached =
      selectedCalendarId !== draft?.opened.calendar.id
        ? draftCache.get(selectedCalendarId)
        : undefined;
    if (cached) {
      setDraftCache((current) => {
        const next = new Map(current);
        if (draft) next.delete(draft.opened.calendar.id);
        return next;
      });
      setDraft(cached);
      setPreview(null);
      onOpened(selectedCalendarId);
      onRouteCalendar?.(selectedCalendarId);
      notify('Análise reaberta com o preenchimento preservado nesta sessão.');
      return;
    }
    const operation = beginOperation(selectedCalendarId, 'open');
    try {
      const opened = await reviews.get(selectedCalendarId);
      if (operationRef.current !== operation) return;
      if (opened.calendar.id !== selectedCalendarId)
        throw new Error('O calendário solicitado não está disponível para revisão.');
      setDraftCache((current) => {
        const next = new Map(current);
        if (draft) next.delete(draft.opened.calendar.id);
        return next;
      });
      setDraft(initialDraft(opened));
      onOpened?.(selectedCalendarId);
      onRouteCalendar?.(selectedCalendarId);
      setPreview(null);
      notify('Indicações automáticas disponíveis para conferência.');
    } catch (error) {
      if (operationRef.current === operation) notify(nativeError(error).message);
    } finally {
      finishOperation(operation);
    }
  }

  async function saveReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (actionPending.current || !draft) return;
    const operation = beginOperation(draft.opened.calendar.id, 'save');
    try {
      const { opened } = draft;
      await reviews.save(opened.calendar.id, {
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
      const updated = await reviews.get(opened.calendar.id);
      if (operationRef.current !== operation) return;
      setDraft(initialDraft(updated));
      setPreview(null);
      notify('Análise salva.');
    } catch (error) {
      if (operationRef.current === operation) notify(nativeError(error).message);
    } finally {
      finishOperation(operation);
    }
  }

  async function exportReview(action: 'preview' | 'copy' | 'html' | 'txt') {
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
      const document = await reviews.export(
        draft.opened.calendar.id,
        draft.opened.review!.revision,
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
      if (operationRef.current === operation) notify(nativeError(error).message);
    } finally {
      finishOperation(operation);
    }
  }

  const opened =
    !routeUnavailable && (!routed || draft?.opened.calendar.id === routeCalendarId)
      ? draft?.opened
      : undefined;
  const reviewedCount = draft?.entries.filter((entry) => entry.reviewed).length || 0;
  return (
    <section id="review-panel" className="page" aria-busy={busy}>
      <div className="panel">
        <h2>Revisão técnico-pedagógica · DENTEC/PROENS</h2>
        <p>
          A revisão apoia o parecer; assinatura e tramitação ocorrem no SEI. Não constitui aprovação
          institucional.
        </p>
        <label>
          Calendário para revisão
          <select
            id="review-calendar"
            value={calendarId}
            disabled={busy || (!calendars.length && !routeCalendarId)}
            onChange={(event) => setSelectedCalendar(event.target.value as Id<'calendars'>)}
          >
            {routeCalendarId && !calendars.some((calendar) => calendar.id === routeCalendarId) ? (
              <option value={routeCalendarId}>
                {opened?.calendar.name || 'Calendário solicitado'}
              </option>
            ) : null}
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
        <Button
          type="button"
          id="open-review"
          disabled={busy || !calendarId}
          onClick={() => {
            void openReview();
          }}
        >
          <Eye size={18} aria-hidden="true" />{' '}
          {pending === 'open' ? 'Abrindo análise…' : 'Abrir análise'}
        </Button>
        <Pagination pagination={pagination} label="Carregar mais calendários" />
        {routeCalendarId && onRouteCalendar ? (
          <a
            href="/revisoes"
            onClick={(event) => {
              if (
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              )
                return;
              event.preventDefault();
              onRouteCalendar(null);
            }}
          >
            Voltar à lista de revisões
          </a>
        ) : null}
        <p id="review-message" role="status" aria-live="polite">
          {message || (!calendars.length ? 'Nenhum calendário disponível para revisão.' : '')}
        </p>
        {opened && draft ? (
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
            <form
              id="review-form"
              onSubmit={(event) => {
                void saveReview(event);
              }}
            >
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
                A busca por nome e categoria pode omitir registros ou relacionar itens indevidos;
                confira as evidências antes de concluir.
              </p>
              {!opened.sameYear ? (
                <p id="review-year-warning" className="notice" role="status">
                  Referência: Parecer SEI 3959640 ({opened.source.year}), páginas 1 e 2. Confira a
                  norma aplicável a {opened.calendar.year}.
                </p>
              ) : null}
              <ul id="review-items" className="records">
                {opened.criteria.map((criterion, index) => (
                  <ReviewCriterion
                    key={criterion.id}
                    criterion={criterion}
                    number={index + 1}
                    entry={draft.entries[index]}
                    changed={Boolean(draft.changed[criterion.id])}
                    saved={Boolean(
                      opened.review?.entries.some((entry) => entry.id === criterion.id),
                    )}
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
                  setDraft((current) =>
                    current ? { ...current, conclusionEditable: true } : current,
                  )
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
            <ReviewPreview document={preview} previewRef={previewRef} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default function ReviewPanel() {
  const location = useAppLocation();
  const routeCalendarId = /^\/revisoes\/([^/]+)$/.exec(location.pathname)?.[1];
  const requestedId = routeCalendarId ? decodeURIComponent(routeCalendarId) : '';
  const [openedId, setOpenedId] = useState<Id<'calendars'> | null>(null);
  const pagination = usePaginatedQuery(
    functions.native.calendarPage,
    { deleted: false },
    { initialNumItems: 50 },
  );
  const calendars = pagination.results;
  const [knownCalendarIds, setKnownCalendarIds] = useState(
    () => new Set(calendars.map((calendar) => calendar.id)),
  );
  if (calendars.some((calendar) => !knownCalendarIds.has(calendar.id))) {
    setKnownCalendarIds(
      new Set([...knownCalendarIds, ...calendars.map((calendar) => calendar.id)]),
    );
  }
  const knownUnavailable = Boolean(
    requestedId &&
    pagination.status === 'Exhausted' &&
    knownCalendarIds.has(requestedId as Id<'calendars'>) &&
    !calendars.some((calendar) => calendar.id === requestedId),
  );
  const liveId = openedId && openedId === requestedId && !knownUnavailable ? openedId : null;
  const liveQueries = useMemo(() => {
    const queries: RequestForQueries = {};
    if (liveId) queries.review = { query: functions.native.review, args: { id: liveId } };
    return queries;
  }, [liveId]);
  // A direct record may be outside every loaded page. Subscription errors must
  // remain local even when its removal cannot be inferred from the list.
  const { review: liveResult } = useQueries(liveQueries) as { review?: ReviewSupport | Error };
  const routeUnavailable = knownUnavailable || liveResult instanceof Error;
  const liveReview = liveResult instanceof Error ? undefined : liveResult;
  return (
    <ReviewContent
      calendars={calendars}
      pagination={pagination}
      liveReview={liveReview}
      onOpened={setOpenedId}
      routeCalendarId={requestedId}
      routeKey={location.pathname}
      routeUnavailable={routeUnavailable}
      onRouteCalendar={(id) => {
        void navigateApp(id ? `/revisoes/${encodeURIComponent(id)}` : '/revisoes');
      }}
    />
  );
}
