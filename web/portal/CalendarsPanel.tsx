import { Button } from '../components/ui/Button.tsx';
import { formText } from './form-values.ts';
import type { Bootstrap, Notify } from '../native/types.ts';
import type { FormEvent } from 'react';
import type { TrashData } from '../native/types.ts';
import type { PaginationState } from './Pagination.tsx';
type Modality = Bootstrap['calendars'][number]['offer'];
type Regime = Parameters<typeof calendarClient.create>[0]['regime'];
import { confirmAction } from '../components/confirmation.ts';
import { useState } from 'react';
import { ArchiveRestore, CalendarPlus, ExternalLink, FileUp, Trash2 } from 'lucide-react';
import { calendarName } from '../../src/calendar-label.ts';
import { modalityLabels, selectableModalities } from '../../src/modalities.ts';
import { calendars as calendarClient } from '../native/client.ts';
import { useAction } from './useAction.ts';
import Pagination from './Pagination.tsx';
import CollectionPanel from './CollectionPanel.tsx';
import { useRouteForm } from './route-form.ts';
import { AppLink, navigateApp } from '../routing.tsx';
import { editorUrl } from '../../src/app-routes.ts';

export function updatedLabel(value: string | null | undefined) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime())
    ? date.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : 'Data não disponível';
}

export default function CalendarsPanel({
  info,
  canSelectCampus,
  filter,
  onFilter,
  notify,
  liveTrash,
  pagination,
  trashPagination,
}: {
  info: Bootstrap;
  canSelectCampus: boolean;
  filter: string;
  onFilter: (id: string) => void;
  notify: Notify;
  liveTrash?: TrashData;
  pagination: PaginationState;
  trashPagination: PaginationState;
}) {
  const [creating, setCreating] = useRouteForm('calendars');
  const [campusId, setCampusId] = useState('');
  const [year, setYear] = useState('2027');
  const trash = liveTrash?.calendars ?? [];
  const trashLoading = liveTrash === undefined;
  const { pending, run } = useAction(notify);
  const campus = info.campuses.find((c) => c.id === campusId) || info.campuses[0];
  const name = campus ? calendarName(year, campus.name) : '';
  const calendars = info.calendars.filter((c) => !filter || c.campusId === filter);

  function createCalendar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const purpose =
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'definitive'
        ? 'definitive'
        : 'test';
    run(async () => {
      if (!campus)
        throw new Error(
          'Nenhum campus ativo está disponível para esta conta. Solicite à administração PROENS a conferência do seu cadastro.',
        );
      const calendar = await calendarClient.create({
        purpose,
        campusId: campus.id,
        year: Number(year),
        modalities: form
          .getAll('calendar-modality')
          .filter((value): value is string => typeof value === 'string')
          .filter((value): value is Modality => selectableModalities.some((m) => m === value)),
        regime: form.get('regime') as Regime,
        courses: formText(form, 'courses'),
        classes: formText(form, 'classes'),
        shifts: formText(form, 'shifts'),
      });
      await navigateApp(editorUrl(calendar.id));
    });
  }

  function remove(calendar: Bootstrap['calendars'][number]) {
    void confirmAction({
      title: 'Mover calendário para a lixeira?',
      description: `O calendário “${calendar.name}” sairá das listas de trabalho e pareceres.`,
      consequence: 'Seus dados e documentos serão preservados para restauração.',
      intent: 'danger',
      confirmLabel: 'Mover para a lixeira',
      pendingLabel: 'Movendo…',
      onConfirm: async () => {
        await calendarClient.remove(calendar.id, calendar.version);
        notify('Calendário movido para a lixeira. Você pode restaurá-lo abaixo.');
      },
    });
  }

  return (
    <section id="calendars" className="page" aria-busy={pending}>
      <CollectionPanel
        title="Calendários registrados"
        actionLabel="Novo calendário"
        formTitle="Criar calendário"
        formOpen={creating}
        onFormOpen={setCreating}
        busy={pending}
        form={
          <form id="create-calendar" onSubmit={createCalendar}>
            {!campus ? (
              <p id="calendar-campus-notice" className="notice" role="status">
                Nenhum campus ativo vinculado à conta. Solicite a regularização à administração
                PROENS.
              </p>
            ) : null}
            <fieldset className="form-fields" disabled={pending || !campus}>
              <div className="calendar-identity-fields">
                <label>
                  Campus
                  <select
                    id="calendar-campus"
                    required
                    disabled={!canSelectCampus || !campus}
                    value={campus?.id || ''}
                    onChange={(e) => setCampusId(e.target.value)}
                  >
                    {info.campuses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Ano
                  <input
                    id="calendar-year"
                    type="number"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    min="1900"
                    max="9999"
                    required
                  />
                </label>
                <label>
                  Organização do calendário
                  <select id="calendar-regime" name="regime" defaultValue="anual">
                    <option value="anual">Anual</option>
                    <option value="semestral">Semestral</option>
                    <option value="misto">Anual e semestral</option>
                  </select>
                </label>
              </div>
              <fieldset id="calendar-modalities" aria-describedby="calendar-modalities-help">
                <legend>Forma de oferta/nível</legend>
                <p id="calendar-modalities-help" className="help">
                  Selecione uma ou mais opções.
                </p>
                <div className="calendar-modality-options">
                  {selectableModalities.map((m) => (
                    <label className="check" key={m}>
                      <input type="checkbox" name="calendar-modality" value={m} />
                      {modalityLabels[m]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="row-form calendar-course-fields">
                <label>
                  <span id="calendar-name-label">Nome do calendário</span>
                  <output
                    id="calendar-name"
                    htmlFor="calendar-campus calendar-year"
                    aria-labelledby="calendar-name-label"
                    aria-describedby="calendar-name-help"
                  >
                    {name || 'Nenhum campus disponível'}
                  </output>
                  <small id="calendar-name-help">
                    Gerado automaticamente a partir do campus e do ano.
                  </small>
                </label>
                <label>
                  <span id="calendar-courses-label">Nome dos cursos</span>
                  <input
                    id="calendar-courses"
                    name="courses"
                    required
                    maxLength={1000}
                    aria-labelledby="calendar-courses-label"
                    aria-describedby="calendar-courses-help"
                  />
                  <small id="calendar-courses-help">
                    Separe os cursos por vírgulas. Ex.: Técnico em Informática, Técnico em
                    Administração.
                  </small>
                </label>
              </div>
              <div className="row-form">
                <label>
                  <span id="calendar-classes-label">
                    Turmas <span className="field-optional">(opcional)</span>
                  </span>
                  <input
                    id="calendar-classes"
                    name="classes"
                    maxLength={500}
                    aria-labelledby="calendar-classes-label"
                    aria-describedby="calendar-classes-help"
                  />
                  <small id="calendar-classes-help">
                    Separe as turmas por vírgulas. Ex.: 1º ano A, 2º ano A, 3º ano B.
                  </small>
                </label>
                <label>
                  <span id="calendar-shifts-label">
                    Turnos <span className="field-optional">(opcional)</span>
                  </span>
                  <input
                    id="calendar-shifts"
                    name="shifts"
                    maxLength={200}
                    aria-labelledby="calendar-shifts-label"
                    aria-describedby="calendar-shifts-help"
                  />
                  <small id="calendar-shifts-help">
                    Separe os turnos por vírgulas. Ex.: matutino, vespertino, noturno.
                  </small>
                </label>
              </div>
              <div className="calendar-purpose-help">
                <p>
                  <strong>De teste:</strong> para experimentar a ferramenta. Os PDFs recebem a
                  indicação de teste. Você pode convertê-lo em definitivo depois, mantendo os dados.
                </p>
                <p>
                  <strong>Definitivo:</strong> para preparar o calendário que será encaminhado para
                  análise. Enquanto houver pendências, você pode gerar um PDF da proposta para
                  análise. O PDF final exige as verificações de dias letivos, conflitos e critérios,
                  além da revisão humana atualizada.
                </p>
                <p className="help">
                  Criar um calendário definitivo não significa que ele já esteja aprovado.
                </p>
              </div>
              <div className="actions">
                <Button type="submit" name="purpose" value="test">
                  <CalendarPlus aria-hidden="true" size={18} />
                  Criar calendário de teste
                </Button>
                <Button type="submit" name="purpose" value="definitive">
                  <CalendarPlus aria-hidden="true" size={18} />
                  Criar calendário definitivo
                </Button>
              </div>
            </fieldset>
          </form>
        }
      >
        <p className="help">Horários de Brasília</p>
        {canSelectCampus ? (
          <label id="filter-label">
            Filtrar por campus
            <select id="campus-filter" value={filter} onChange={(e) => onFilter(e.target.value)}>
              <option value="">Todos os campi</option>
              {info.campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <ul id="calendar-list" className="records">
          {calendars.length ? (
            calendars.map((c) => (
              <li key={c.id} data-calendar-campus={c.campusId}>
                <div>
                  <strong>
                    {c.purpose === 'test' ? '[TESTE] ' : '[DEFINITIVO] '}
                    {c.name}
                  </strong>
                  <small>
                    {c.name ===
                    calendarName(
                      c.year,
                      info.campuses.find((campus) => campus.id === c.campusId)?.name,
                    ) ? null : (
                      <>
                        {info.campuses.find((campus) => campus.id === c.campusId)?.name} · {c.year}{' '}
                        ·{' '}
                      </>
                    )}
                    {(c.modalities || [c.offer]).map((m) => modalityLabels[m] || m).join(' + ')}
                  </small>
                  <small>Última atualização: {updatedLabel(c.updatedAt)}</small>
                  <small>
                    {c.courses}
                    {c.classes ? ' · ' + c.classes : ''}
                    {c.shifts ? ' · ' + c.shifts : ''}
                  </small>
                </div>
                <AppLink href={editorUrl(c.id)}>
                  <ExternalLink aria-hidden="true" size={18} />
                  Abrir calendário
                </AppLink>
                <AppLink href={editorUrl(c.id, 'history')}>
                  <FileUp aria-hidden="true" size={18} />
                  Enviar calendário anterior
                </AppLink>
                <Button
                  type="button"
                  variant="danger"
                  data-delete-calendar={c.id}
                  disabled={pending}
                  onClick={() => remove(c)}
                >
                  <Trash2 aria-hidden="true" size={18} />
                  Excluir calendário
                </Button>
              </li>
            ))
          ) : (
            <li>
              {pagination.status === 'LoadingFirstPage'
                ? 'Carregando calendários…'
                : filter
                  ? 'Nenhum calendário registrado para este campus.'
                  : 'Nenhum calendário registrado nesta conta.'}
            </li>
          )}
        </ul>
        <Pagination pagination={pagination} label="Carregar mais calendários" />
        <details className="panel calendar-trash">
          <summary>Lixeira de calendários</summary>
          {trash.length ? <p>Os dados e documentos são preservados para restauração.</p> : null}
          <ul id="calendar-trash-list" className="records">
            {trashLoading ? (
              <li>Carregando lixeira…</li>
            ) : trash.length ? (
              trash.map((c) => (
                <li key={c.id}>
                  <div>
                    <strong>{c.name}</strong>
                    <small>Excluído em {new Date(c.deletedAt!).toLocaleString('pt-BR')}</small>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    data-restore-calendar={c.id}
                    disabled={pending}
                    onClick={() =>
                      run(async () => {
                        await calendarClient.restore(c.id);
                        notify('Calendário restaurado.');
                      })
                    }
                  >
                    <ArchiveRestore aria-hidden="true" size={18} />
                    Restaurar calendário
                  </Button>
                </li>
              ))
            ) : (
              <li>A lixeira está vazia.</li>
            )}
          </ul>
          <Pagination pagination={trashPagination} label="Carregar mais calendários da lixeira" />
        </details>
      </CollectionPanel>
    </section>
  );
}
