import { reviewIsCurrent } from '../../../src/calendar-base/index.ts';
import { useEffect, useRef, useState, type SetStateAction } from 'react';
import { reviews } from '../../shared/convex/reviews.ts';
import { nativeError } from '../../shared/convex/errors.ts';
import { useDraftForm } from '../../shared/forms/useDraftForm.ts';
import { updateConclusion } from '../../../src/review-conclusion.ts';
import { reviewNorm } from '../../../src/review-presentation.ts';
import { scrollIntoView } from '../../scroll.ts';
import ReviewFormView from './ReviewFormView.tsx';
import { downloadDocument } from './review-export.tsx';
import {
  initialDraft,
  type ReviewSupport,
  type ReviewDraft,
  type ReviewEntry,
  type ReviewDocument,
} from './review-values.ts';

export default function ReviewEditor({
  opened,
  onMessage,
}: {
  opened: ReviewSupport;
  onMessage: (message: string) => void;
}) {
  const [previewData, setPreviewData] = useState<{
    document: ReviewDocument;
    revision: string;
  } | null>(null);
  const [exporting, setExporting] = useState(false);
  const exportBusy = useRef(false);
  const active = useRef(true);
  const previewRef = useRef<HTMLDivElement>(null);
  const conclusionRef = useRef<HTMLTextAreaElement>(null);
  const { form, values, submit, pending, error, clearDraft } = useDraftForm({
    draftKey: `review:${opened.calendar.id}`,
    defaultValues: { draft: initialDraft(opened) },
    onSubmit: async ({ draft }, { isCurrent }) => {
      const base = draft.opened;
      await reviews.save(base.calendar.id, {
        entries: draft.entries,
        conclusion: draft.conclusion,
        processNumber: draft.processNumber,
        applicableNorm: draft.applicableNorm,
        revision: base.review?.revision || 0,
        calendarVersion: base.calendar.version,
        catalogueRevision: base.catalogueRevision,
        baseIdentity: base.baseIdentity,
        rulesetVersion: base.rulesetVersion,
        acknowledgeStale: draft.acknowledgeStale,
      });
      const updated = await reviews.get(base.calendar.id);
      if (!isCurrent()) return;
      form.reset({ draft: initialDraft(updated) });
      clearDraft();
      setPreview(null);
      onMessage('Análise salva.');
    },
    onError: onMessage,
  });
  const draft = values.draft;
  const dirty = draft.dirty;
  const previewRevision = `${draft.opened.calendar.version}:${draft.opened.baseIdentity ?? draft.opened.catalogueRevision}:${draft.opened.review?.revision || 0}`;
  const preview = previewData?.revision === previewRevision ? previewData.document : null;
  const setPreview = (document: ReviewDocument | null) =>
    setPreviewData(document ? { document, revision: previewRevision } : null);
  const busy = pending || exporting;
  const setDraft = (update: SetStateAction<ReviewDraft>) => {
    form.setFieldValue('draft', (current) =>
      typeof update === 'function' ? update(current) : update,
    );
    setPreview(null);
  };
  const remoteChanged =
    !reviewIsCurrent(
      {
        calendarVersion: draft.opened.calendar.version,
        catalogueRevision: draft.opened.catalogueRevision,
        baseIdentity: draft.opened.baseIdentity,
        rulesetVersion: draft.opened.rulesetVersion,
      },
      opened.calendar.version,
      {
        revision: opened.catalogueRevision,
        identity: opened.baseIdentity,
        rulesetVersion: opened.rulesetVersion,
      },
    ) || (opened.review?.revision || 0) !== (draft.opened.review?.revision || 0);
  useEffect(() => {
    if (!remoteChanged || dirty || pending || exporting) return;
    form.reset({ draft: initialDraft(opened) });
    onMessage('A análise foi atualizada com as alterações recebidas de outra sessão.');
  }, [remoteChanged, dirty, pending, exporting, opened, form, onMessage]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty && !pending) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty, pending]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (preview) scrollIntoView(previewRef.current, { behavior: 'smooth' });
  }, [preview]);
  useEffect(() => {
    if (draft.conclusionEditable) conclusionRef.current?.focus();
  }, [draft.conclusionEditable]);

  function withConclusion(current: ReviewDraft, changes: Partial<ReviewDraft>) {
    const next = { ...current, ...changes, dirty: true };
    return {
      ...next,
      conclusion: updateConclusion(
        next.conclusion,
        next.opened.criteria,
        next.entries,
        reviewNorm(next.opened.calendar.year, next.opened.sameYear ? next.opened.source.norm : ''),
      ),
    };
  }
  function changeField<
    K extends 'conclusion' | 'processNumber' | 'applicableNorm' | 'acknowledgeStale',
  >(field: K, value: ReviewDraft[K]) {
    setDraft((current) => withConclusion(current, { [field]: value }));
  }
  function changeEntry<K extends 'status' | 'notes'>(id: string, field: K, value: ReviewEntry[K]) {
    setDraft((current) =>
      withConclusion(current, {
        entries: current.entries.map((entry) =>
          entry.id === id ? { ...entry, [field]: value, reviewed: false } : entry,
        ),
        changed: { ...current.changed, [id]: true },
      }),
    );
  }
  function confirmEntry(id: string) {
    setDraft((current) =>
      withConclusion(current, {
        entries: current.entries.map((entry) =>
          entry.id === id && entry.status !== 'PENDENTE' ? { ...entry, reviewed: true } : entry,
        ),
        changed: { ...current.changed, [id]: true },
      }),
    );
  }
  async function exportReview(action: 'preview' | 'copy' | 'html' | 'txt') {
    if (busy || exportBusy.current) return;
    if (dirty || !draft.opened.review || remoteChanged) {
      onMessage('Salve a análise antes de visualizar, copiar ou baixar o parecer.');
      return;
    }
    exportBusy.current = true;
    setExporting(true);
    try {
      const document = await reviews.export(draft.opened.calendar.id, draft.opened.review.revision);
      if (!active.current) return;
      if (action === 'preview') {
        setPreview(document);
        onMessage('Parecer disponível abaixo para leitura e seleção do texto.');
      } else if (action === 'html' || action === 'txt') {
        downloadDocument(document, draft, action);
        onMessage('Download solicitado. Confira a minuta e a formatação antes de inserir no SEI.');
      } else {
        setPreview(document);
        try {
          if (window.ClipboardItem && navigator.clipboard?.write) {
            await navigator.clipboard.write([
              new window.ClipboardItem({
                'text/html': new Blob([document.body], { type: 'text/html' }),
                'text/plain': new Blob([document.text], { type: 'text/plain' }),
              }),
            ]);
          } else await navigator.clipboard.writeText(document.text);
          if (active.current)
            onMessage('Parecer copiado. Cole no editor do SEI e confira a tabela e o texto.');
        } catch {
          if (active.current)
            onMessage(
              'O navegador não permitiu copiar automaticamente. Selecione o parecer exibido abaixo e use Ctrl+C, ou baixe o HTML.',
            );
        }
      }
    } catch (cause) {
      if (active.current) onMessage(nativeError(cause).message);
    } finally {
      exportBusy.current = false;
      if (active.current) setExporting(false);
    }
  }
  return (
    <>
      {remoteChanged && dirty ? (
        <p className="notice" role="status">
          O calendário, a base institucional ou a revisão mudou em outra sessão. Suas alterações
          foram preservadas. Salve uma cópia das observações e reabra a análise para conferir a
          versão atual.
        </p>
      ) : null}
      <ReviewFormView
        draft={draft}
        busy={busy}
        pending={pending ? 'save' : exporting ? 'export' : ''}
        error={error}
        preview={preview}
        previewRef={previewRef}
        conclusionRef={conclusionRef}
        submit={submit}
        setDraft={setDraft}
        changeField={changeField}
        changeEntry={changeEntry}
        confirmEntry={confirmEntry}
        exportReview={exportReview}
      />
    </>
  );
}
