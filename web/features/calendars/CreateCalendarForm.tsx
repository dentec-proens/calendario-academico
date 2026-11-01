import { defaultCalendarYear, policyFor } from '#src/domain/policies/registry.ts';
import { useNavigate } from '@tanstack/react-router';
import { CalendarPlus, MapPin } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import { ChoiceGroup } from '../../components/ui/ChoiceGroup.tsx';
import type { Bootstrap } from '../../shared/convex/types.ts';
import { calendars as calendarClient } from '../../shared/convex/calendars.ts';
import { calendarName } from '#src/domain/calendar/label.ts';
import { modalityLabels, selectableModalities } from '#src/domain/calendar/modalities.ts';
import { calendarLimits, organizationLabels, type Modality } from '#src/domain/calendar/config.ts';
import { useDraftForm } from '../../shared/forms/useDraftForm.ts';
import { FormFeedback } from '../../shared/forms/FormFeedback.tsx';
import { Notice } from '../../components/ui/Notice.tsx';

type Organization = 'anual' | 'semestral';
interface CreationOffer {
  kind: Modality;
  organization: Organization;
}

const organizationOptions = (['anual', 'semestral'] as const).map((value) => ({
  value,
  label: organizationLabels[value],
}));
const otherYear = 'outro';
const yearOptions = [
  ...[defaultCalendarYear - 1, defaultCalendarYear, defaultCalendarYear + 1].map((year) => ({
    value: String(year),
    label: String(year),
  })),
  { value: otherYear, label: 'Outro' },
];

/**
 * Creation asks only what opens the editor: campus, year and one offer per kind. Courses, classes,
 * shifts, a label and repeated kinds are filled in the editor, where they remain editable.
 */
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
    otherYear: boolean;
    offers: CreationOffer[];
  } = {
    campusId: '',
    year: String(defaultCalendarYear),
    otherYear: false,
    offers: [],
  };
  const { form, values, submit, pending, error, clearDraft } = useDraftForm({
    draftKey: `calendar:new:${info.user.id}`,
    defaultValues: defaults,
    onSubmit: async (value, { isCurrent }) => {
      const selectedCampus =
        info.campuses.find((item) => item.id === value.campusId) || info.campuses[0];
      if (!selectedCampus)
        throw new Error(
          'Nenhum campus ativo está disponível para esta conta. Solicite à administração PROENS a conferência do seu cadastro.',
        );
      if (!value.offers.length) throw new Error('Marque ao menos uma oferta.');
      const calendar = await calendarClient.create({
        campusId: selectedCampus.id,
        year: Number(value.year),
        offers: value.offers,
      });
      if (!isCurrent()) return;
      clearDraft();
      await navigate({
        to: '/calendarios/$calendarId/editar',
        params: { calendarId: calendar.id },
      });
    },
  });
  const campus = info.campuses.find((item) => item.id === values.campusId) || info.campuses[0];
  const configured = policyFor(values.year).configured;
  const offerFor = (kind: Modality) => values.offers.find((offer) => offer.kind === kind);
  // Offers follow the catalogue order, whatever the order in which they were marked.
  const setOffer = (kind: Modality, organization: Organization | null) =>
    form.setFieldValue(
      'offers',
      selectableModalities.flatMap((item): CreationOffer[] => {
        const current = item === kind ? organization : offerFor(item)?.organization;
        return current ? [{ kind: item, organization: current }] : [];
      }),
    );
  const summary = values.offers
    .map(
      (offer) =>
        `${modalityLabels[offer.kind]} (${organizationLabels[offer.organization].toLowerCase()})`,
    )
    .join(' + ');

  return (
    <form id="create-calendar" onSubmit={submit}>
      {!campus ? (
        <Notice tone="warning" id="calendar-campus-notice" announce="polite">
          Nenhum campus ativo vinculado à conta. Solicite a regularização à administração PROENS.
        </Notice>
      ) : null}
      <fieldset className="form-fields" disabled={pending || !campus}>
        {canSelectCampus ? (
          <label className="calendar-create-campus">
            Campus
            <select
              id="calendar-campus"
              required
              value={campus?.id || ''}
              onChange={(event) => form.setFieldValue('campusId', event.target.value)}
            >
              {info.campuses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        ) : campus ? (
          <p id="calendar-campus" className="calendar-create-campus-name">
            <MapPin aria-hidden="true" size={16} /> Campus {campus.name}
          </p>
        ) : null}
        <ChoiceGroup
          id="calendar-year"
          label="Ano letivo"
          className="calendar-create-year"
          value={values.otherYear ? otherYear : values.year}
          options={yearOptions}
          aria-describedby={configured ? undefined : 'calendar-year-help'}
          onValueChange={(choice) => {
            form.setFieldValue('otherYear', choice === otherYear);
            if (choice !== otherYear) form.setFieldValue('year', choice);
          }}
        />
        {values.otherYear ? (
          <label className="calendar-create-other-year">
            Ano
            <input
              id="calendar-year-other"
              type="number"
              required
              min={calendarLimits.minimumYear}
              max={calendarLimits.maximumYear}
              value={values.year}
              onChange={(event) => form.setFieldValue('year', event.target.value)}
            />
          </label>
        ) : null}
        {configured || !values.year ? null : (
          <p id="calendar-year-help" className="help calendar-create-year-help">
            Ainda não há norma configurada para {values.year}. O editor registra as datas, mas não
            confere o atendimento às regras.
          </p>
        )}
        <fieldset
          id="calendar-offers"
          className="calendar-create-offers"
          aria-describedby="calendar-offers-help"
        >
          <legend>Ofertas</legend>
          <div className="calendar-create-offer-grid">
            {selectableModalities.map((kind) => {
              const offer = offerFor(kind);
              return (
                <div
                  key={kind}
                  className="calendar-create-offer"
                  data-create-offer={kind}
                  data-selected={offer ? '' : undefined}
                >
                  <label className="check">
                    <input
                      type="checkbox"
                      id={`calendar-offer-${kind}`}
                      name="calendar-offer"
                      value={kind}
                      checked={Boolean(offer)}
                      onChange={(event) => setOffer(kind, event.target.checked ? 'anual' : null)}
                    />
                    {modalityLabels[kind]}
                  </label>
                  {offer ? (
                    <ChoiceGroup
                      id={`calendar-offer-${kind}-organization`}
                      label="Organização"
                      className="calendar-create-organization"
                      value={offer.organization}
                      options={organizationOptions}
                      onValueChange={(organization) => setOffer(kind, organization)}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
          <p id="calendar-offers-help" className="help">
            Duas ofertas do mesmo tipo, cursos, turmas e modo de oferta são ajustados depois, no
            editor.
          </p>
        </fieldset>
        <div className="calendar-create-footer">
          <div className="calendar-create-preview">
            <output
              id="calendar-name"
              htmlFor="calendar-campus calendar-year"
              aria-label="Nome do calendário"
            >
              {campus ? calendarName(values.year, campus.name) : 'Nenhum campus disponível'}
            </output>
            <small id="calendar-offer-summary">
              {summary || 'Nenhuma oferta marcada'} · começa como rascunho
            </small>
          </div>
          <Button type="submit" pending={pending} loadingLabel="Criando…">
            <CalendarPlus aria-hidden="true" size={18} />
            Criar rascunho
          </Button>
        </div>
      </fieldset>
      <FormFeedback error={error} />
    </form>
  );
}
