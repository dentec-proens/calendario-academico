import type { CalendarRecord, CalendarState, CalendarSave } from '../types.ts';
import { equalValues } from '#src/shared/equal.ts';
import { createAutosaver } from '../../../autosave.ts';
import type { AutosaveStatus } from '../../../autosave.ts';
import { inspectCalendar } from '#src/domain/calendar/base.ts';
import { kinds } from '#src/domain/calendar/offers.ts';
import { rulesetVersion } from '#src/domain/policies/registry.ts';

export interface EditorSnapshot {
  record: CalendarRecord;
  state: CalendarState;
  dirty: boolean;
  unapplied: boolean;
  status: AutosaveStatus | 'idle';
  error: string;
  remote: CalendarRecord | null;
  formEpoch: number;
  /** Counts the changes to the state, not its confirmation, which an offer to undo depends on. */
  edits: number;
  baseUpdate: ReturnType<
    typeof inspectCalendar<
      CalendarRecord['institutionalEvents'][number],
      CalendarRecord['documentSnapshot'][number]
    >
  >;
}

/** An expired session is the one refusal that clears by itself, so it says what to do instead. */
function failureMessage(detail: unknown) {
  if (!(detail instanceof Error)) return 'Não foi possível salvar.';
  return 'status' in detail && detail.status === 401
    ? 'Sua sessão expirou. Entre novamente: as alterações continuam nesta página.'
    : detail.message;
}

const baseMark = (record: CalendarRecord) => record.currentCatalogueRevision;

function withoutStamp(state: CalendarState) {
  const { rulesetVersion: _stamp, ...content } = state;
  return content;
}

export function createEditorSession(
  record: CalendarRecord,
  write: (body: {
    state: CalendarState;
    version: number;
    catalogueRevision: number;
  }) => Promise<CalendarSave>,
  readOnly = false,
  canEdit = () => true,
  onSaveFailure: (error: unknown) => void = () => undefined,
) {
  let current: EditorSnapshot = {
    record: structuredClone(record),
    state: structuredClone(record.state),
    dirty: false,
    unapplied: false,
    status: 'idle',
    error: '',
    remote: null,
    formEpoch: 0,
    edits: 0,
    baseUpdate: inspectCalendar(record, record),
  };
  let active = true;
  let abandoned = false;
  let accessSuspended = false;
  let suspendedStatus: Pick<EditorSnapshot, 'status' | 'error'> | null = null;
  const listeners = new Set<() => void>();
  const forms = new Set<string>();
  function publish(update: Partial<EditorSnapshot>) {
    if (!active) return;
    current = { ...current, ...update };
    current.baseUpdate = inspectCalendar(current.record, current.remote ?? current.record);
    for (const listener of listeners) listener();
  }
  const saver = createAutosaver({
    isDirty: () => current.dirty,
    snapshot: () => ({
      state: current.state,
      version: current.record.version,
      catalogueRevision: current.record.catalogueRevision,
    }),
    write: async (sent) => {
      try {
        return await write(sent);
      } catch (cause) {
        onSaveFailure(cause);
        throw cause;
      }
    },
    onSaved: (saved, sent) => {
      const unchanged = equalValues(current.state, sent.state);
      const { base, unchanged: _unchanged, ...value } = saved;
      // The save result has no identity; a snapshot received meanwhile carries the latest one.
      const described =
        current.remote && current.remote.version <= saved.version ? current.remote : current.record;
      const confirmed = {
        ...current.record,
        courses: described.courses,
        classes: described.classes,
        shifts: described.shifts,
        label: described.label,
        name: described.name,
        ...value,
        offerKinds: kinds(saved.state),
        // A save with nothing to record leaves the stored copy where it was.
        ...(saved.unchanged
          ? {}
          : {
              catalogueRevision: base.revision,
              institutionalSnapshot: base.events,
            }),
        ...(base.revision >= current.record.currentCatalogueRevision
          ? {
              currentCatalogueRevision: base.revision,
              institutionalEvents: base.events,
            }
          : {}),
      };
      publish({
        record: confirmed,
        ...(unchanged ? { state: structuredClone(saved.state) } : {}),
        dirty: !unchanged,
        remote:
          current.remote &&
          current.remote.version <= saved.version &&
          current.remote.currentCatalogueRevision === confirmed.currentCatalogueRevision
            ? null
            : current.remote,
      });
    },
    onStatus: (status, detail) => {
      const update = {
        status,
        error: status === 'error' || status === 'blocked' ? failureMessage(detail) : '',
      };
      if (accessSuspended) suspendedStatus = update;
      else publish(update);
    },
  });
  function assertEditing() {
    if (!canEdit()) throw new Error('Aguarde a atualização do portal.');
    if (abandoned || !active) throw new Error('A sessão de edição foi encerrada.');
    if (accessSuspended) throw new Error('Entre novamente para salvar as alterações.');
    if (readOnly) throw new Error('Consulta em modo somente leitura.');
  }
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    apply(command: (state: CalendarState) => CalendarState) {
      assertEditing();
      if (current.status === 'blocked')
        throw new Error(current.error || 'Resolva o conflito antes de aplicar alterações.');
      const changed = command(structuredClone(current.state));
      const state = { ...structuredClone(changed), rulesetVersion: rulesetVersion(changed) };
      // The stamp follows real changes: on its own it does not make a new version.
      const dirty = !equalValues(withoutStamp(state), withoutStamp(current.record.state));
      publish({
        state,
        dirty,
        edits: current.edits + 1,
        status: !dirty && current.status === 'scheduled' ? 'saved' : current.status,
      });
      saver.schedule();
    },
    replace(state: CalendarState) {
      assertEditing();
      if (current.status === 'blocked')
        throw new Error(current.error || 'Resolva o conflito antes de importar.');
      forms.clear();
      publish({
        state: structuredClone(state),
        dirty: !equalValues(state, current.record.state),
        unapplied: false,
        formEpoch: current.formEpoch + 1,
        edits: current.edits + 1,
      });
      saver.schedule();
    },
    setFormDirty(key: string, dirty: boolean) {
      if (dirty) forms.add(key);
      else forms.delete(key);
      const unapplied = forms.size > 0;
      if (unapplied !== current.unapplied) publish({ unapplied });
    },
    receive(fresh: CalendarRecord) {
      const newest = current.remote ?? current.record;
      if (
        fresh.version < newest.version ||
        fresh.currentCatalogueRevision < newest.currentCatalogueRevision
      )
        return;
      const changed =
        fresh.version !== current.record.version ||
        fresh.currentCatalogueRevision !== current.record.currentCatalogueRevision;
      if (!changed) {
        if (!equalValues(fresh, current.record)) publish({ record: fresh });
        return;
      }
      if (fresh.version < current.record.version) return;
      // A new catalogue reaches the open editor as it is: only another person's version waits.
      if (fresh.version === current.record.version) {
        publish({ record: { ...fresh, state: current.record.state }, remote: null });
      } else if (current.dirty || current.unapplied || current.status === 'saving')
        publish({ remote: fresh });
      else {
        publish({
          record: fresh,
          state: structuredClone(fresh.state),
          remote: null,
          edits: current.edits + 1,
        });
      }
    },
    async retry() {
      if (readOnly) return;
      assertEditing();
      await saver.save(true);
    },
    async flush() {
      if (!readOnly) await saver.flush();
      return current.record;
    },
    /**
     * What a submission states: the base the person was seeing. A flush may bring a newer base that
     * the subscription had not delivered yet, and that one has not been seen. The identity is read
     * only afterwards because a just-added offer legitimately changes what applies to the calendar.
     */
    async prepareSubmission() {
      const seen = baseMark(current.record);
      const saved = await saver.flush().then(() => current.record);
      if (baseMark(saved) !== seen)
        throw new Error(
          'A base institucional mudou enquanto você preenchia. Confira o calendário e envie novamente.',
        );
      return { version: saved.version, baseIdentity: current.baseUpdate.identity };
    },
    reopenRemote() {
      if (!active || abandoned || !canEdit())
        throw new Error('A sessão de edição não está disponível.');
      if (current.status === 'saving') throw new Error('Aguarde a confirmação do salvamento.');
      const fresh = current.remote ?? current.record;
      forms.clear();
      saver.resume();
      publish({
        record: structuredClone(fresh),
        state: structuredClone(fresh.state),
        dirty: false,
        unapplied: false,
        status: 'idle',
        error: '',
        remote: null,
        formEpoch: current.formEpoch + 1,
        edits: current.edits + 1,
      });
    },
    setAccessSuspended(value: boolean) {
      if (accessSuspended === value) return;
      accessSuspended = value;
      if (value) {
        suspendedStatus = { status: current.status, error: current.error };
        publish({
          status: 'blocked',
          error: 'Edição pausada. Aguarde a liberação do acesso para continuar.',
        });
      } else {
        publish(suspendedStatus ?? { status: 'idle', error: '' });
        suspendedStatus = null;
      }
      saver.setSuspended(value);
    },
    abandon() {
      abandoned = true;
      saver.dispose();
      forms.clear();
      publish({
        state: structuredClone(current.record.state),
        dirty: false,
        unapplied: false,
        status: 'idle',
        error: '',
        formEpoch: current.formEpoch + 1,
        edits: current.edits + 1,
      });
    },
    dispose() {
      active = false;
      saver.dispose();
      listeners.clear();
    },
  };
}

export type EditorSession = ReturnType<typeof createEditorSession>;
