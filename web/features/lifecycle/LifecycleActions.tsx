import { useState, type FormEvent, type ReactNode } from 'react';
import { useQuery } from 'convex/react';
import { Archive, ArchiveRestore, CheckCheck, RotateCcw, Send, Stamp, Undo2 } from 'lucide-react';
import {
  actionLabels,
  canTransition,
  maximumNoteLength,
  statusLabels,
  type CalendarStatus,
  type LifecycleAction,
  type LifecycleRole,
} from '#src/domain/calendar/lifecycle.ts';
import { modalityLabels } from '#src/domain/calendar/modalities.ts';
import type { Id } from '../../../convex/_generated/dataModel.js';
import { Button } from '../../components/ui/Button.tsx';
import { TextAreaField, TextField } from '../../components/ui/Field.tsx';
import { Notice } from '../../components/ui/Notice.tsx';
import { confirmAction } from '../../components/confirmation.ts';
import { calendars } from '../../shared/convex/calendars.ts';
import { functions } from '../../shared/convex/client.ts';
import { nativeError } from '../../shared/convex/errors.ts';
import './lifecycle.css';

export function StatusBadge({ status }: { status: CalendarStatus }) {
  return (
    <span className="status-badge" data-status={status}>
      {statusLabels[status]}
    </span>
  );
}

export interface LifecycleCalendar {
  id: string;
  name: string;
  status: CalendarStatus;
  statusRevision: number;
}

const confirmations: Partial<
  Record<LifecycleAction, { description: string; consequence?: string; intent?: 'warning' }>
> = {
  submit: {
    description: 'O calendário seguirá para a análise da PROENS e ficará travado para edição.',
    consequence: 'Você pode recolher o envio enquanto a revisão não começar.',
  },
  withdraw: {
    description: 'O calendário volta para edição. O envio fica registrado no histórico.',
    intent: 'warning',
  },
  conclude: {
    description: 'A revisão será registrada como concluída e o calendário aguardará publicação.',
  },
  reopen: { description: 'A revisão volta a ficar em análise.', intent: 'warning' },
  archive: {
    description: 'O calendário deixa de ser vigente e fica disponível apenas para consulta.',
    intent: 'warning',
  },
  reinstate: { description: 'O calendário volta a ser o vigente para seus tipos de oferta.' },
};

const icons: Partial<Record<LifecycleAction, typeof Send>> = {
  submit: Send,
  withdraw: Undo2,
  return: RotateCcw,
  conclude: CheckCheck,
  reopen: RotateCcw,
  publish: Stamp,
  archive: Archive,
  reinstate: ArchiveRestore,
};

const shownIssues = 6;
const pendencies = (count: number) => `${count} ${count === 1 ? 'pendência' : 'pendências'}`;

/** Order in which the actions appear; the review starts on its own with the first save. */
const offered: LifecycleAction[] = [
  'submit',
  'withdraw',
  'conclude',
  'reopen',
  'return',
  'publish',
  'archive',
  'reinstate',
];

/**
 * Offers the transitions the role may perform from the current status. The backend checks the
 * same table and every condition again; this only avoids offering an impossible action.
 */
export default function LifecycleActions({
  calendar,
  role,
  notify,
  prepare,
  submitSummary,
  guard,
  unavailable,
  submitIssues = [],
  className = '',
  placement = 'header',
}: {
  calendar: LifecycleCalendar;
  role: LifecycleRole;
  notify: (text: string, error?: boolean) => void;
  /** Runs before submitting, e.g. to flush the editor, and returns what is being submitted. */
  prepare?: () => Promise<{ version?: number; baseIdentity?: string }>;
  /** Shown in the submission dialog, such as what changed since the return. */
  submitSummary?: string;
  /** A reason to refuse every action now, such as unsaved work in the review form. */
  guard?: () => string | undefined;
  /** Why an offered action cannot run now: the button stays visible, disabled, with the reason. */
  unavailable?: Partial<Record<LifecycleAction, string>>;
  /** Content issues still open: submitting stays possible, after confirming them one by one. */
  submitIssues?: readonly string[];
  className?: string;
  /** The footer of the review step repeats only the submission, as the step's conclusion. */
  placement?: 'header' | 'footer';
}) {
  const [form, setForm] = useState<'return' | 'publish' | null>(null);
  const [pending, setPending] = useState(false);
  const actions = offered.filter(
    (action) =>
      canTransition(calendar.status, action, role) &&
      (placement === 'header' || action === 'submit'),
  );
  // The footer copy has its own ids, so the header keeps the attributes tests and links use.
  const idPrefix = placement === 'footer' ? 'footer-' : '';
  // The administration may submit a partial replacement, confirmed explicitly as at publication.
  const preview = useQuery(
    functions.calendars.replacementPreview,
    role === 'ADMIN' && actions.includes('submit')
      ? { id: calendar.id as Id<'calendars'> }
      : 'skip',
  );
  if (!actions.length) return null;
  const issueCount = pendencies(submitIssues.length);
  // The dialog lists the first issues only; its buttons stay in view and the rest are a step away.
  const listedIssues =
    submitIssues.length > shownIssues
      ? [
          ...submitIssues.slice(0, shownIssues),
          `E mais ${pendencies(submitIssues.length - shownIssues)} na etapa Revisão e conclusão.`,
        ]
      : submitIssues;
  const uncovered = [...new Set(preview?.replaced.flatMap((item) => item.uncovered) ?? [])].map(
    (kind) => modalityLabels[kind],
  );

  async function perform(
    action: LifecycleAction,
    extra: { note?: string; sei?: string; partial?: boolean } = {},
  ) {
    const submitted = action === 'submit' && prepare ? await prepare() : {};
    await calendars.transition(calendar.id, {
      from: calendar.status,
      statusRevision: calendar.statusRevision,
      action,
      ...submitted,
      ...extra,
    });
    notify(`${actionLabels[action]}: concluído.`);
  }

  function start(action: LifecycleAction) {
    const refusal = guard?.();
    if (refusal) {
      notify(refusal, true);
      return;
    }
    if (action === 'submit' && uncovered.length) {
      void confirmAction({
        title: 'Enviar com substituição parcial?',
        description: `Este calendário não inclui ${uncovered.join(', ')}, atendidos pelo calendário vigente que ele substituirá.`,
        consequence: 'Ao publicá-lo, esses tipos de oferta ficarão sem calendário vigente.',
        intent: 'warning',
        items: listedIssues,
        confirmLabel: 'Confirmar substituição parcial e enviar',
        pendingLabel: 'Registrando…',
        onConfirm: () => perform('submit', { partial: true }),
      });
      return;
    }
    if (action === 'return' || action === 'publish') {
      setForm(form === action ? null : action);
      return;
    }
    const confirmation = confirmations[action]!;
    if (action === 'submit' && submitIssues.length) {
      void confirmAction({
        title: `Enviar com ${issueCount}?`,
        description: `${confirmation.description} Com as pendências abaixo, a PROENS pode devolvê-lo para ajustes.`,
        items: listedIssues,
        consequence: [submitSummary, confirmation.consequence].filter(Boolean).join(' '),
        intent: 'warning',
        confirmLabel: 'Enviar mesmo assim',
        pendingLabel: 'Registrando…',
        onConfirm: () => perform(action),
      });
      return;
    }
    void confirmAction({
      title: `${actionLabels[action]}?`,
      description: confirmation.description,
      consequence:
        action === 'submit' && submitSummary
          ? [submitSummary, confirmation.consequence].filter(Boolean).join(' ')
          : confirmation.consequence,
      intent: confirmation.intent ?? 'primary',
      confirmLabel: actionLabels[action],
      pendingLabel: 'Registrando…',
      onConfirm: () => perform(action),
    });
  }

  async function run(operation: () => Promise<void>) {
    if (pending) return;
    setPending(true);
    try {
      await operation();
      setForm(null);
    } catch (cause) {
      notify(nativeError(cause).message, true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={`lifecycle-actions ${className}`}>
      <div className="actions">
        {actions.map((action) => {
          const Icon = icons[action] ?? Send;
          const reason = unavailable?.[action];
          return (
            <Button
              key={action}
              type="button"
              data-lifecycle-action={placement === 'header' ? action : undefined}
              data-lifecycle-footer-action={placement === 'footer' ? action : undefined}
              variant={action === 'return' || action === 'withdraw' ? 'secondary' : 'primary'}
              disabled={pending || !!reason}
              aria-describedby={reason ? `${idPrefix}lifecycle-${action}-unavailable` : undefined}
              aria-expanded={
                action === 'return' || action === 'publish' ? form === action : undefined
              }
              onClick={() => start(action)}
            >
              <Icon aria-hidden="true" size={18} /> {actionLabels[action]}
            </Button>
          );
        })}
      </div>
      {actions.map((action) =>
        unavailable?.[action] ? (
          <p
            key={action}
            id={`${idPrefix}lifecycle-${action}-unavailable`}
            className="lifecycle-unavailable"
          >
            {unavailable[action]}
          </p>
        ) : null,
      )}
      {form === 'return' ? (
        <ReturnForm
          pending={pending}
          onCancel={() => setForm(null)}
          onSubmit={(note) => void run(() => perform('return', { note }))}
        />
      ) : null}
      {form === 'publish' ? (
        <PublishForm
          calendarId={calendar.id}
          pending={pending}
          onCancel={() => setForm(null)}
          onSubmit={(sei, partial) => void run(() => perform('publish', { sei, partial }))}
        />
      ) : null}
    </div>
  );
}

function ReturnForm({
  pending,
  onSubmit,
  onCancel,
}: {
  pending: boolean;
  onSubmit: (note: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState('');
  return (
    <form
      className="lifecycle-form"
      aria-label="Devolver ao campus"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        onSubmit(note);
      }}
    >
      <TextAreaField
        id="lifecycle-return-note"
        label="O que o campus precisa ajustar"
        description="A nota fica registrada no envio e aparece para o campus no editor."
        required
        rows={4}
        maxLength={maximumNoteLength}
        value={note}
        disabled={pending}
        onValueChange={setNote}
      />
      <FormButtons pending={pending} label="Devolver ao campus" onCancel={onCancel} />
    </form>
  );
}

function PublishForm({
  calendarId,
  pending,
  onSubmit,
  onCancel,
}: {
  calendarId: string;
  pending: boolean;
  onSubmit: (sei: string, partial: boolean) => void;
  onCancel: () => void;
}) {
  const preview = useQuery(functions.calendars.replacementPreview, {
    id: calendarId as Id<'calendars'>,
  });
  const [sei, setSei] = useState<string | null>(null);
  const [partial, setPartial] = useState(false);
  if (!preview) return <p className="help">Carregando a publicação…</p>;
  const uncovered = preview.replaced.filter((item) => item.uncovered.length);
  return (
    <form
      className="lifecycle-form"
      aria-label="Publicar calendário"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        onSubmit(sei ?? preview.suggestedSei, partial);
      }}
    >
      <TextField
        id="lifecycle-sei"
        label="Processo SEI nº"
        description="Formato 00000.000000/0000-00. Preenchido com o número informado no parecer; confirme ou corrija."
        required
        pattern="\d{5}\.\d{6}/\d{4}-\d{2}"
        value={sei ?? preview.suggestedSei}
        disabled={pending}
        onValueChange={(value) => setSei(String(value))}
      />
      {preview.replaced.length ? (
        <div className="lifecycle-replaced">
          <p>A publicação arquivará os calendários vigentes que compartilham ofertas:</p>
          <ul>
            {preview.replaced.map((item) => (
              <li key={item.id}>
                {item.name} ({item.offerKinds.map((kind) => modalityLabels[kind]).join(', ')})
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="help">Nenhum calendário vigente será substituído.</p>
      )}
      {uncovered.length ? (
        <Notice tone="warning">
          Este calendário não inclui{' '}
          {[...new Set(uncovered.flatMap((item) => item.uncovered))]
            .map((kind) => modalityLabels[kind])
            .join(', ')}
          . Esses tipos de oferta ficarão sem calendário vigente.
          <label className="check">
            <input
              id="lifecycle-partial"
              type="checkbox"
              checked={partial}
              disabled={pending}
              onChange={(event) => setPartial(event.target.checked)}
            />
            Confirmo a substituição parcial.
          </label>
        </Notice>
      ) : null}
      <FormButtons
        pending={pending}
        label="Publicar"
        disabled={uncovered.length > 0 && !partial}
        onCancel={onCancel}
      />
    </form>
  );
}

function FormButtons({
  pending,
  label,
  disabled,
  onCancel,
}: {
  pending: boolean;
  label: string;
  disabled?: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="actions">
      <Button type="submit" pending={pending} disabled={disabled} loadingLabel="Registrando…">
        {label}
      </Button>
      <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
        Cancelar
      </Button>
    </div>
  );
}

/** The returned note, prominent where the campus edits. */
export function ReturnNote({
  lastReturn,
  children,
}: {
  lastReturn: { sequence: number; at: string; note: string } | null;
  children?: ReactNode;
}) {
  if (!lastReturn) return null;
  return (
    <Notice tone="warning" title={`Devolução do envio ${lastReturn.sequence}`} id="return-note">
      <p className="return-note-text">{lastReturn.note}</p>
      <small>Devolvido em {new Date(lastReturn.at).toLocaleString('pt-BR')}.</small>
      {children}
    </Notice>
  );
}
