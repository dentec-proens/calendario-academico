import type { CalendarRecord, CalendarState, CalendarSave } from '../types.ts';
import { equalValues } from '#src/shared/equal.ts';
import { createAutosaver } from '../../../autosave.ts';
import type { AutosaveStatus } from '../../../autosave.ts';
import { inspectCalendar, reconcile } from '#src/domain/calendar/base.ts';
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
  baseUpdate: ReturnType<
    typeof inspectCalendar<
      CalendarRecord['institutionalEvents'][number],
      CalendarRecord['currentDocuments'][number]
    >
  >;
}

export function createEditorSession(
  record: CalendarRecord,
  write: (body: {
    state: CalendarState;
    version: number;
    catalogueRevision: number;
    baseAcceptance?: string;
  }) => Promise<CalendarSave>,
  readOnly = false,
  canEdit = () => true,
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
    baseUpdate: inspectCalendar(record, record),
  };
  let active = true;
  let abandoned = false;
  let accessSuspended = false;
  let suspendedStatus: Pick<EditorSnapshot, 'status' | 'error'> | null = null;
  let baseAcceptance: string | undefined;
  let rejectedBaseAcceptance = false;
  const listeners = new Set<() => void>();
  const forms = new Set<string>();
  function publish(update: Partial<EditorSnapshot>) {
    if (!active) return;
    current = { ...current, ...update };
    current.baseUpdate = inspectCalendar(current.record, current.remote ?? current.record);
    for (const listener of listeners) listener();
    if (
      rejectedBaseAcceptance &&
      current.status === 'blocked' &&
      !accessSuspended &&
      current.baseUpdate.compatible &&
      (!current.remote || current.remote.version === current.record.version)
    ) {
      rejectedBaseAcceptance = false;
      saver.resume();
      publish({ status: current.dirty ? 'pending' : 'idle', error: '' });
      saver.schedule();
    }
  }
  const saver = createAutosaver({
    isDirty: () => current.dirty,
    snapshot: () => ({
      state: current.state,
      version: current.record.version,
      catalogueRevision: current.record.catalogueRevision,
      ...(baseAcceptance ? { baseAcceptance } : {}),
    }),
    write: async (sent) => {
      try {
        return await write(sent);
      } catch (cause) {
        if (
          sent.baseAcceptance &&
          cause &&
          typeof cause === 'object' &&
          'status' in cause &&
          cause.status === 409
        ) {
          if (baseAcceptance === sent.baseAcceptance) baseAcceptance = undefined;
          rejectedBaseAcceptance = true;
        }
        throw cause;
      }
    },
    onSaved: (saved, sent) => {
      const unchanged = equalValues(current.state, sent.state);
      const { base, unchanged: _unchanged, ...value } = saved;
      const confirmed = {
        ...current.record,
        ...value,
        offerKinds: kinds(saved.state),
        catalogueRevision: base.revision,
        institutionalSnapshot: base.events,
        documentSnapshot: base.documents,
        ...(base.revision >= current.record.currentCatalogueRevision
          ? {
              currentCatalogueRevision: base.revision,
              institutionalEvents: base.events,
              currentDocuments: base.documents,
            }
          : {}),
      };
      if (baseAcceptance === sent.baseAcceptance) baseAcceptance = undefined;
      rejectedBaseAcceptance = false;
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
        error:
          status === 'error' || status === 'blocked'
            ? detail instanceof Error
              ? detail.message
              : 'Não foi possível salvar.'
            : '',
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
      const dirty = !equalValues(state, current.record.state);
      publish({
        state,
        dirty,
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
      if (
        fresh.version === current.record.version &&
        inspectCalendar(current.record, fresh).compatible
      ) {
        publish({ record: { ...fresh, state: current.record.state }, remote: null });
      } else if (current.dirty || current.unapplied || current.status === 'saving')
        publish({ remote: fresh });
      else {
        publish({ record: fresh, state: structuredClone(fresh.state), remote: null });
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
    confirmDefinitive(
      value: Pick<CalendarRecord, 'purpose' | 'version' | 'updatedAt' | 'readiness'>,
    ) {
      assertEditing();
      publish({
        record: { ...current.record, ...value },
        remote: current.remote && current.remote.version <= value.version ? null : current.remote,
      });
    },
    async confirmBase(acceptance: string) {
      assertEditing();
      if (current.unapplied)
        throw new Error('Aplique ou descarte os campos em edição antes de confirmar a base.');
      if (current.status === 'saving') await saver.save();
      const latest = current.remote || current.record;
      if (latest.version !== current.record.version)
        throw new Error(
          'Há uma versão mais recente do calendário. Reabra antes de confirmar a base.',
        );
      reconcile(inspectCalendar(current.record, latest), acceptance);
      baseAcceptance = acceptance;
      publish({
        dirty: true,
        state: {
          ...structuredClone(current.state),
          rulesetVersion: rulesetVersion(current.state),
        },
      });
      saver.resume();
      await saver.save(true);
      await saver.flush();
      if (current.status === 'blocked' || current.status === 'error')
        throw new Error(current.error);
    },
    reopenRemote() {
      if (!active || abandoned || !canEdit())
        throw new Error('A sessão de edição não está disponível.');
      if (current.status === 'saving') throw new Error('Aguarde a confirmação do salvamento.');
      const fresh = current.remote ?? current.record;
      forms.clear();
      baseAcceptance = undefined;
      rejectedBaseAcceptance = false;
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
