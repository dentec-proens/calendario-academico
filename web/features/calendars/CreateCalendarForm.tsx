import { calendarLimits } from '#src/domain/calendar/config.ts';
import { defaultCalendarYear } from '#src/domain/policies/registry.ts';
import type { FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { CalendarPlus } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import type { Bootstrap } from '../../shared/convex/types.ts';
import { calendars as calendarClient } from '../../shared/convex/calendars.ts';
import { calendarName } from '#src/domain/calendar/label.ts';
import { modalityLabels, selectableModalities } from '#src/domain/calendar/modalities.ts';
import { useDraftForm } from '../../shared/forms/useDraftForm.ts';
import { FormFeedback } from '../../shared/forms/FormFeedback.tsx';
import { Notice } from '../../components/ui/Notice.tsx';
import type { OfferKind } from '#src/domain/calendar/model.ts';
import { validateOffers } from '#src/domain/calendar/normalization/normalize-v4.ts';

interface CreationOfferDraft {
  key: string;
  kind: OfferKind | '';
  organization: 'anual' | 'semestral';
  label: string;
}

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
    offers: CreationOfferDraft[];
    courses: string;
    classes: string;
    shifts: string;
    purpose: 'test' | 'definitive';
  } = {
    campusId: '',
    year: String(defaultCalendarYear),
    offers: [{ key: 'offer-1', kind: '', organization: 'anual', label: '' }],
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
      const offers = validateOffers(
        value.offers.map((offer, index) => {
          const kind = selectableModalities.find((kind) => kind === offer.kind);
          if (!kind) throw new Error('Selecione o tipo de cada oferta.');
          return {
            id: `offer-${index + 1}`,
            kind,
            organization: offer.organization,
            label: offer.label,
            delivery: 'a-conferir',
          };
        }),
      );
      const calendar = await calendarClient.create({
        courses: value.courses,
        classes: value.classes,
        shifts: value.shifts,
        purpose: value.purpose,
        offers: offers.map(({ kind, organization, label }) => ({
          kind,
          organization,
          ...(label ? { label } : {}),
        })),
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
              min={calendarLimits.minimumYear}
              max={calendarLimits.maximumYear}
              required
            />
          </label>
        </div>
        <fieldset
          id="calendar-offers"
          className="calendar-offer-list"
          aria-describedby="calendar-offers-help"
        >
          <legend>Ofertas do calendário</legend>
          <p id="calendar-offers-help" className="help">
            Inclua cada oferta com sua organização. Ofertas do mesmo tipo precisam de nomes
            distintos. As etapas, o modo de oferta e a norma aplicável serão definidos no editor.
          </p>
          {values.offers.map((offer, index) => {
            const repeated =
              Boolean(offer.kind) &&
              values.offers.filter((item) => item.kind === offer.kind).length > 1;
            return (
              <fieldset className="calendar-offer-create" key={offer.key} data-create-offer={index}>
                <legend>Oferta {index + 1}</legend>
                <div className="calendar-offer-fields">
                  <label>
                    Tipo de oferta
                    <select
                      id={`calendar-offer-${index}-kind`}
                      name={`offers[${index}].kind`}
                      value={offer.kind}
                      required
                      onChange={(event) => {
                        const kind =
                          selectableModalities.find((kind) => kind === event.target.value) ?? '';
                        form.setFieldValue(`offers[${index}].kind`, kind);
                      }}
                    >
                      <option value="">Selecione</option>
                      {selectableModalities.map((kind) => (
                        <option key={kind} value={kind}>
                          {modalityLabels[kind]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Organização
                    <select
                      id={`calendar-offer-${index}-organization`}
                      name={`offers[${index}].organization`}
                      value={offer.organization}
                      required
                      onChange={(event) => {
                        const organization = event.target.value;
                        if (organization === 'anual' || organization === 'semestral')
                          form.setFieldValue(`offers[${index}].organization`, organization);
                      }}
                    >
                      <option value="anual">Anual</option>
                      <option value="semestral">Semestral</option>
                    </select>
                  </label>
                  <label>
                    Nome da oferta {repeated ? '(obrigatório)' : '(opcional)'}
                    <input
                      id={`calendar-offer-${index}-label`}
                      name={`offers[${index}].label`}
                      value={offer.label}
                      required={repeated}
                      maxLength={calendarLimits.maximumTextLength}
                      onChange={(event) =>
                        form.setFieldValue(`offers[${index}].label`, event.target.value)
                      }
                      placeholder="Ex.: Licenciatura em Química"
                    />
                  </label>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={values.offers.length === 1}
                  aria-label={`Remover oferta ${index + 1}`}
                  onClick={() =>
                    form.setFieldValue(
                      'offers',
                      values.offers.filter((_, position) => position !== index),
                    )
                  }
                >
                  Remover oferta
                </Button>
              </fieldset>
            );
          })}
          <Button
            id="calendar-add-offer"
            type="button"
            variant="secondary"
            disabled={values.offers.length >= calendarLimits.maximumOffers}
            onClick={() =>
              form.setFieldValue('offers', [
                ...values.offers,
                { key: crypto.randomUUID(), kind: '', organization: 'anual', label: '' },
              ])
            }
          >
            Adicionar oferta
          </Button>
          <p className="help">Até {calendarLimits.maximumOffers} ofertas por calendário.</p>
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
