import { useState, type FormEvent, type ReactNode } from 'react';
import { useQuery } from 'convex/react';
import {
  Archive,
  ArchiveRestore,
  CheckCheck,
  Ellipsis,
  Plus,
  RotateCcw,
  Send,
  Stamp,
  Undo2,
} from 'lucide-react';
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
import { fillReturnNote, type ReturnedCriterion } from '#src/domain/reviews/returned-criteria.ts';
import type { Id } from '../../../convex/_generated/dataModel.js';
import { ActionMenu, ActionMenuItem } from '../../components/ui/ActionMenu.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { TextAreaField, TextField } from '../../components/ui/Field.tsx';
import { Notice } from '../../components/ui/Notice.tsx';
import { confirmAction } from '../../components/confirmation.ts';
import { calendars } from '../../shared/convex/calendars.ts';
import { functions } from '../../shared/convex/client.ts';
import { nativeError } from '../../shared/convex/errors.ts';
import { useFeedback } from '../feedback/FeedbackProvider.tsx';
import './lifecycle.css';

export function CalendarStatusBadge({ status }: { status: CalendarStatus }) {
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
  reinstate: { description: 'O calendário volta a ser vigente.' },
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
  visibleReasons = true,
  className = '',
  placement = 'header',
  menuActions = [],
  primaryActions,
  returnCriteria,
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
  /** False keeps each reason only as the button's description, for a header short on space. */
  visibleReasons?: boolean;
  className?: string;
  /** The footer of the review step repeats only the submission, as the step's conclusion. */
  placement?: 'header' | 'footer';
  /** Occasional actions, kept in a menu instead of beside the main ones. */
  menuActions?: readonly LifecycleAction[];
  /** The actions shown as primary; by default, all but returning and withdrawing. */
  primaryActions?: readonly LifecycleAction[];
  /** The unmet criteria of the saved parecer, to fill the note; only the parecer's page has them. */
  returnCriteria?: readonly ReturnedCriterion[];
}) {
  const [form, setForm] = useState<'return' | 'publish' | null>(null);
  const [pending, setPending] = useState(false);
  const feedback = useFeedback();
  const actions = offered.filter(
    (action) =>
      canTransition(calendar.status, action, role) &&
      (placement === 'header' || action === 'submit'),
  );
  // The footer copy has its own ids, so the header keeps the attributes tests and links use.
  const idPrefix = placement === 'footer' ? 'footer-' : '';
  if (!actions.length) return null;
  const inMenu = actions.filter((action) => menuActions.includes(action));

  async function perform(
    action: LifecycleAction,
    extra: { note?: string; sei?: string; replaces?: Id<'calendars'>[] } = {},
  ) {
    const submitted = action === 'submit' && prepare ? await prepare() : {};
    await calendars.transition(calendar.id, {
      from: calendar.status,
      statusRevision: calendar.statusRevision,
      action,
      ...submitted,
      ...extra,
    });
    notify(
      action === 'submit' ? 'Calendário enviado à PROENS.' : `${actionLabels[action]}: concluído.`,
    );
    feedback.offer(action, calendar.id);
  }

  function start(action: LifecycleAction) {
    const refusal = guard?.();
    if (refusal) {
      notify(refusal, true);
      return;
    }
    if (action === 'return' || action === 'publish') {
      setForm(form === action ? null : action);
      return;
    }
    const confirmation = confirmations[action]!;
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
        {actions
          .filter((action) => !inMenu.includes(action))
          .map((action) => {
            const Icon = icons[action] ?? Send;
            const reason = unavailable?.[action];
            return (
              <Button
                key={action}
                type="button"
                data-lifecycle-action={placement === 'header' ? action : undefined}
                data-lifecycle-footer-action={placement === 'footer' ? action : undefined}
                variant={
                  (primaryActions?.includes(action) ??
                  (action !== 'return' && action !== 'withdraw'))
                    ? 'primary'
                    : 'secondary'
                }
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
        {inMenu.length ? (
          <ActionMenu
            label="Mais ações"
            disabled={pending}
            trigger={<Ellipsis aria-hidden="true" size={18} />}
          >
            {inMenu.map((action) => {
              const Icon = icons[action] ?? Send;
              return (
                <ActionMenuItem
                  key={action}
                  data-lifecycle-action={action}
                  disabled={!!unavailable?.[action]}
                  onClick={() => start(action)}
                >
                  <Icon aria-hidden="true" size={18} /> {actionLabels[action]}
                </ActionMenuItem>
              );
            })}
          </ActionMenu>
        ) : null}
      </div>
      {actions.map((action) =>
        unavailable?.[action] ? (
          <p
            key={action}
            id={`${idPrefix}lifecycle-${action}-unavailable`}
            className={visibleReasons ? 'lifecycle-unavailable' : 'visually-hidden'}
          >
            {unavailable[action]}
          </p>
        ) : null,
      )}
      {form === 'return' ? (
        <ReturnForm
          criteria={returnCriteria}
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
          onSubmit={(sei, replaces) => void run(() => perform('publish', { sei, replaces }))}
        />
      ) : null}
    </div>
  );
}

function ReturnForm({
  criteria,
  pending,
  onSubmit,
  onCancel,
}: {
  criteria?: readonly ReturnedCriterion[];
  pending: boolean;
  onSubmit: (note: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState('');
  const [fillOutcome, setFillOutcome] = useState('');
  function fill(available: readonly ReturnedCriterion[]) {
    const { note: filled, added, left } = fillReturnNote(note, available, maximumNoteLength);
    setNote(filled);
    setFillOutcome(
      left.length
        ? `A nota tem limite de ${maximumNoteLength.toLocaleString('pt-BR')} caracteres: ${added ? 'entrou parte dos critérios' : 'nenhum critério coube'}. Ficaram de fora ${left.join(', ')}, que o campus vê na lista mesmo assim.`
        : added
          ? ''
          : 'Os critérios não atendidos já estão na nota.',
    );
  }
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
        description="A nota fica registrada no envio e aparece para o campus no editor, com a lista dos critérios marcados como Não atendido no parecer salvo e suas observações."
        required
        rows={4}
        maxLength={maximumNoteLength}
        value={note}
        disabled={pending}
        onValueChange={(value) => {
          setNote(value);
          setFillOutcome('');
        }}
      />
      {criteria ? (
        <div className="lifecycle-fill">
          <Button
            type="button"
            variant="secondary"
            id="lifecycle-fill-note"
            disabled={pending || !criteria.length}
            aria-describedby={criteria.length ? undefined : 'lifecycle-fill-unavailable'}
            onClick={() => fill(criteria)}
          >
            <Plus aria-hidden="true" size={18} /> Preencher com os critérios não atendidos
          </Button>
          {criteria.length ? null : (
            <p className="help" id="lifecycle-fill-unavailable">
              Nenhum critério está marcado como Não atendido no parecer salvo.
            </p>
          )}
          {/* Always mounted: a status inserted along with its text may go unread. */}
          <div id="lifecycle-fill-outcome" role="status">
            {fillOutcome ? <Notice tone="warning">{fillOutcome}</Notice> : null}
          </div>
        </div>
      ) : null}
      <FormButtons pending={pending} label="Devolver ao campus" onCancel={onCancel} />
    </form>
  );
}

type Replacement = 'replace' | 'keep';

/**
 * The SEI process and, for every other calendar in force of the campus and year, whether this one
 * replaces it. No answer is preselected: a forgotten one would leave two calendars in force for
 * the same courses, or archive one that should stay.
 */
function PublishForm({
  calendarId,
  pending,
  onSubmit,
  onCancel,
}: {
  calendarId: string;
  pending: boolean;
  onSubmit: (sei: string, replaces: Id<'calendars'>[]) => void;
  onCancel: () => void;
}) {
  const preview = useQuery(functions.calendars.replacementPreview, {
    id: calendarId as Id<'calendars'>,
  });
  const [sei, setSei] = useState<string | null>(null);
  const [choices, setChoices] = useState<Partial<Record<string, Replacement>>>({});
  if (!preview) return <p className="help">Carregando a publicação…</p>;
  const { origin, others } = preview;
  const unanswered = others.filter((other) => !choices[other.id]).length;
  return (
    <form
      className="lifecycle-form"
      aria-label="Publicar calendário"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        if (unanswered) return;
        onSubmit(
          sei ?? preview.suggestedSei,
          others.filter((other) => choices[other.id] === 'replace').map((other) => other.id),
        );
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
      {origin ? (
        <p id="lifecycle-origin" className="lifecycle-origin">
          {origin.status === 'vigente'
            ? `Substitui ${origin.name}.`
            : `A origem, ${origin.name}, já foi substituída${origin.successorName ? ` por ${origin.successorName}` : ''}.`}
        </p>
      ) : null}
      {others.length ? (
        <div className="lifecycle-replaced">
          <p>
            Outros calendários vigentes neste campus e ano. Indique o que acontece com cada um ao
            publicar.
          </p>
          <ul className="lifecycle-others">
            {others.map((other) => (
              <li key={other.id} data-replacement={other.id}>
                <fieldset disabled={pending}>
                  <legend>{other.name}</legend>
                  <p className="lifecycle-other-details">
                    {other.offerKinds.map((kind) => modalityLabels[kind]).join(', ')}
                    {' · '}
                    {other.courses || 'Cursos não informados'}
                  </p>
                  {(
                    [
                      ['replace', 'Substituído por este'],
                      ['keep', 'Continua vigente'],
                    ] as const
                  ).map(([value, label]) => (
                    <label className="check" key={value}>
                      <input
                        type="radio"
                        name={`lifecycle-replacement-${other.id}`}
                        value={value}
                        required
                        checked={choices[other.id] === value}
                        onChange={() => setChoices({ ...choices, [other.id]: value })}
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
              </li>
            ))}
          </ul>
          {unanswered ? (
            <p className="help" id="lifecycle-publish-unanswered">
              Responda{' '}
              {unanswered === 1 ? 'o calendário vigente' : `os ${unanswered} calendários vigentes`}{' '}
              acima para publicar.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="help">Nenhum outro calendário vigente neste campus e ano.</p>
      )}
      <FormButtons
        pending={pending}
        label="Publicar"
        disabled={unanswered > 0}
        describedBy={unanswered ? 'lifecycle-publish-unanswered' : undefined}
        onCancel={onCancel}
      />
    </form>
  );
}

function FormButtons({
  pending,
  label,
  disabled,
  describedBy,
  onCancel,
}: {
  pending: boolean;
  label: string;
  disabled?: boolean;
  /** Why the submission is disabled, when it is. */
  describedBy?: string;
  onCancel: () => void;
}) {
  return (
    <div className="actions">
      <Button
        type="submit"
        pending={pending}
        disabled={disabled}
        aria-describedby={describedBy}
        loadingLabel="Registrando…"
      >
        {label}
      </Button>
      <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
        Cancelar
      </Button>
    </div>
  );
}

/** The returned note and the criteria behind it, prominent where the campus edits. */
export function ReturnNote({
  lastReturn,
  criterionLink,
  children,
}: {
  lastReturn: {
    sequence: number;
    at: string;
    note: string;
    returnedCriteria?: readonly ReturnedCriterion[];
  } | null;
  /** Where each criterion is corrected; nothing when no step decides it. */
  criterionLink?: (criterionId: string, title: string) => ReactNode;
  children?: ReactNode;
}) {
  if (!lastReturn) return null;
  return (
    <Notice tone="warning" title={`Devolução do envio ${lastReturn.sequence}`} id="return-note">
      <p className="return-note-text">{lastReturn.note}</p>
      <small>Devolvido em {new Date(lastReturn.at).toLocaleString('pt-BR')}.</small>
      {lastReturn.returnedCriteria?.length ? (
        <details className="return-criteria" open>
          <summary>Critérios não atendidos ({lastReturn.returnedCriteria.length})</summary>
          <ul>
            {lastReturn.returnedCriteria.map(({ criterionId, title, note }) => (
              <li key={criterionId} data-returned-criterion={criterionId}>
                <strong>{title}</strong>
                {note ? <p className="return-note-text">{note}</p> : null}
                {criterionLink?.(criterionId, title)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {children}
    </Notice>
  );
}
