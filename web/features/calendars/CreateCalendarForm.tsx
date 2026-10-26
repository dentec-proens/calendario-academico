import type { FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { CalendarPlus } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import type { Bootstrap } from '../../shared/convex/types.ts';
import { calendars as calendarClient } from '../../shared/convex/calendars.ts';
import { calendarName } from '../../../src/calendar-label.ts';
import { modalityLabels, selectableModalities } from '../../../src/modalities.ts';
import { useDraftForm } from '../../shared/forms/useDraftForm.ts';
import { FormFeedback } from '../../shared/forms/FormFeedback.tsx';
import { Notice } from '../../components/ui/Notice.tsx';
type Modality = Bootstrap['calendars'][number]['offer'];
type Regime = Parameters<typeof calendarClient.create>[0]['regime'];

export default function CreateCalendarForm({
  info,
  canSelectCampus,
}: {
  info: Bootstrap;
  canSelectCampus: boolean;
}) {
  const navigate = useNavigate();
  const defaults: {
    campusId: string;
    year: string;
    modalities: Modality[];
    regime: Regime;
    courses: string;
    classes: string;
    shifts: string;
    purpose: 'test' | 'definitive';
  } = {
    campusId: '',
    year: '2027',
    modalities: [],
    regime: 'anual',
    courses: '',
    classes: '',
    shifts: '',
    purpose: 'test',
  };
  const {
    form,
    values,
    submit,
    pending: submitting,
    error,
    clearDraft,
  } = useDraftForm({
    draftKey: `calendar:new:${info.user.id}`,
    defaultValues: defaults,
    onSubmit: async (value, { isCurrent }) => {
      const selectedCampus =
        info.campuses.find((item) => item.id === value.campusId) || info.campuses[0];
      if (!selectedCampus)
        throw new Error(
          'Nenhum campus ativo está disponível para esta conta. Solicite à administração PROENS a conferência do seu cadastro.',
        );
      if (!value.modalities.length)
        throw new Error('Selecione ao menos uma forma de oferta/nível.');
      const calendar = await calendarClient.create({
        ...value,
        campusId: selectedCampus.id,
        year: Number(value.year),
      });
      if (!isCurrent()) return;
      clearDraft();
      await navigate({
        to: '/calendarios/$calendarId/editar',
        params: { calendarId: calendar.id },
      });
    },
  });
  const { year } = values;
  const pending = submitting;
  const campus = info.campuses.find((item) => item.id === values.campusId) || info.campuses[0];
  const name = campus ? calendarName(year, campus.name) : '';
  function createCalendar(event: FormEvent<HTMLFormElement>) {
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    form.setFieldValue(
      'purpose',
      submitter?.getAttribute('value') === 'definitive' ? 'definitive' : 'test',
    );
    submit(event);
  }

  return (
    <form id="create-calendar" onSubmit={createCalendar}>
      {!campus ? (
        <Notice tone="warning" id="calendar-campus-notice" announce="polite">
          Nenhum campus ativo vinculado à conta. Solicite a regularização à administração PROENS.
        </Notice>
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
              onChange={(e) => form.setFieldValue('campusId', e.target.value)}
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
              onChange={(e) => form.setFieldValue('year', e.target.value)}
              min="1900"
              max="9999"
              required
            />
          </label>
          <label>
            Organização do calendário
            <select
              id="calendar-regime"
              name="regime"
              value={values.regime}
              onChange={(event) => {
                const value = event.target.value;
                if (value === 'anual' || value === 'semestral' || value === 'misto')
                  form.setFieldValue('regime', value);
              }}
            >
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
                <input
                  type="checkbox"
                  name="calendar-modality"
                  value={m}
                  checked={values.modalities.includes(m)}
                  onChange={(event) =>
                    form.setFieldValue(
                      'modalities',
                      event.target.checked
                        ? [...values.modalities, m]
                        : values.modalities.filter((item) => item !== m),
                    )
                  }
                />
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
              value={values.courses}
              onChange={(event) => form.setFieldValue('courses', event.target.value)}
              required
              maxLength={1000}
              aria-labelledby="calendar-courses-label"
              aria-describedby="calendar-courses-help"
            />
            <small id="calendar-courses-help">
              Separe os cursos por vírgulas. Ex.: Técnico em Informática, Técnico em Administração.
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
              value={values.classes}
              onChange={(event) => form.setFieldValue('classes', event.target.value)}
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
              value={values.shifts}
              onChange={(event) => form.setFieldValue('shifts', event.target.value)}
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
            <strong>De teste:</strong> para experimentar a ferramenta. Os PDFs recebem a indicação
            de teste. Você pode convertê-lo em definitivo depois, mantendo os dados.
          </p>
          <p>
            <strong>Definitivo:</strong> para preparar o calendário que será encaminhado para
            análise. Enquanto houver pendências, você pode gerar um PDF da proposta para análise. O
            PDF final exige as verificações de dias letivos, conflitos e critérios, além da revisão
            humana atualizada.
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
      <FormFeedback error={error} />
    </form>
  );
}
