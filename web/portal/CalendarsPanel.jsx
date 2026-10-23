import { confirmAction } from '../components/confirmation.ts';
import { useState } from 'react';
import { ArchiveRestore, CalendarPlus, ExternalLink, FileUp, Trash2 } from 'lucide-react';
import { calendarName } from '../../src/calendar-label.mjs';
import { modalityLabels, selectableModalities } from '../../src/modalities.mjs';
import { calendars as calendarClient } from '../native/client.ts';
import { useAction } from './useAction.ts';
import Pagination from './Pagination.tsx';

export function updatedLabel(value) {
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
  isAdmin,
  filter,
  onFilter,
  notify,
  liveTrash,
  pagination,
  trashPagination,
}) {
  const [campusId, setCampusId] = useState('');
  const [year, setYear] = useState('2027');
  const trash = liveTrash?.calendars ?? [];
  const trashLoading = liveTrash === undefined;
  const { pending, run } = useAction(notify);
  const campus = info.campuses.find((c) => c.id === campusId) || info.campuses[0];
  const name = campus ? calendarName(year, campus.name) : '';
  const calendars = info.calendars.filter((c) => !filter || c.campusId === filter);

  function createCalendar(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const purpose = event.nativeEvent.submitter?.value || 'test';
    run(async () => {
      if (!campus)
        throw new Error(
          'Nenhum campus ativo está disponível para esta conta. Solicite à administração PROENS a conferência do seu cadastro.',
        );
      const calendar = await calendarClient.create({
        purpose,
        campusId: campus.id,
        year: Number(year),
        modalities: form.getAll('calendar-modality'),
        regime: form.get('regime'),
        courses: form.get('courses'),
        classes: form.get('classes'),
        shifts: form.get('shifts'),
      });
      window.location.assign('/editor?id=' + encodeURIComponent(calendar.id));
    });
  }

  function remove(calendar) {
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
      <div className="panel">
        <h2>Criar calendário</h2>
        <form id="create-calendar" onSubmit={createCalendar}>
          {!campus ? (
            <p id="calendar-campus-notice" className="notice" role="status">
              Nenhum campus ativo vinculado à conta. Solicite a regularização à administração
              PROENS.
            </p>
          ) : null}
          <fieldset className="form-fields" disabled={pending || !campus}>
            <div className="row-form">
              <label>
                Campus
                <select
                  id="calendar-campus"
                  required
                  disabled={!isAdmin || !campus}
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
              <fieldset id="calendar-modalities">
                <legend>Forma de oferta/nível — marque uma ou várias</legend>
                {selectableModalities.map((m) => (
                  <label className="check" key={m}>
                    <input type="checkbox" name="calendar-modality" value={m} />
                    {modalityLabels[m]}
                  </label>
                ))}
              </fieldset>
              <label>
                Organização do calendário
                <select id="calendar-regime" name="regime" defaultValue="anual">
                  <option value="anual">Anual</option>
                  <option value="semestral">Semestral</option>
                  <option value="misto">Anual e semestral</option>
                </select>
              </label>
            </div>
            <div className="row-form">
              <label>
                Nome do calendário
                <input
                  id="calendar-name"
                  value={name}
                  readOnly
                  maxLength={160}
                  placeholder="Preenchido automaticamente pelo campus e ano"
                />
              </label>
              <label>
                Nome dos cursos
                <input
                  id="calendar-courses"
                  name="courses"
                  required
                  maxLength={1000}
                  placeholder="Ex.: Técnico em Informática"
                />
              </label>
            </div>
            <div className="row-form">
              <label>
                Turmas, se aplicável
                <input
                  id="calendar-classes"
                  name="classes"
                  maxLength={500}
                  placeholder="Ex.: 1º, 2º e 3º anos"
                />
              </label>
              <label>
                Turnos, se aplicável
                <input
                  id="calendar-shifts"
                  name="shifts"
                  maxLength={200}
                  placeholder="Ex.: matutino e vespertino"
                />
              </label>
            </div>
            <p>
              Teste: PDF identificado como teste. Definitivo: PDF final sujeito à contagem e à
              revisão dos critérios.
            </p>
            <div className="actions">
              <button type="submit" name="purpose" value="test">
                <CalendarPlus aria-hidden="true" size={18} />
                Criar calendário de teste
              </button>
              <button type="submit" name="purpose" value="definitive">
                <CalendarPlus aria-hidden="true" size={18} />
                Criar calendário definitivo
              </button>
            </div>
          </fieldset>
        </form>
      </div>
      <div className="panel">
        <h2>Calendários registrados</h2>
        <p className="help">Horários de Brasília</p>
        {isAdmin ? (
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
                <a href={'/editor?id=' + encodeURIComponent(c.id)}>
                  <ExternalLink aria-hidden="true" size={18} />
                  Abrir calendário
                </a>
                <a href={'/editor?id=' + encodeURIComponent(c.id) + '#history-area'}>
                  <FileUp aria-hidden="true" size={18} />
                  Enviar calendário anterior
                </a>
                <button
                  type="button"
                  data-delete-calendar={c.id}
                  disabled={pending}
                  onClick={() => remove(c)}
                >
                  <Trash2 aria-hidden="true" size={18} />
                  Excluir calendário
                </button>
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
                    <small>Excluído em {new Date(c.deletedAt).toLocaleString('pt-BR')}</small>
                  </div>
                  <button
                    type="button"
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
                  </button>
                </li>
              ))
            ) : (
              <li>A lixeira está vazia.</li>
            )}
          </ul>
          <Pagination pagination={trashPagination} label="Carregar mais calendários da lixeira" />
        </details>
      </div>
    </section>
  );
}
