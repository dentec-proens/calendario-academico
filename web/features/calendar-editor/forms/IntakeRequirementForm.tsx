import type {
  AcademicTerm,
  ActivityRequirement,
  CalendarOffer,
} from '#src/domain/calendar/model.ts';
import { configureIntakeRequirement } from '#src/domain/calendar/commands/organization.ts';
import { offerLabel } from '#src/domain/calendar/offers.ts';
import { termsFor } from '#src/domain/calendar/organization/periods.ts';
import { policyFor } from '#src/domain/policies/registry.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarForm } from './useCalendarForm.ts';
import { Check } from './fields.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';

function OfferRequirement({ offer, term }: { offer: CalendarOffer; term: AcademicTerm }) {
  const { state, session, readOnly } = useCalendarEditor();
  const modality = offer.id;
  const current = state.offers.find((item) => item.id === offer.id)?.intake?.[term];
  const { form, submit, error } = useCalendarForm(
    `intake-requirement:${modality}:${term}`,
    {
      required: current?.required ?? false,
    },
    (value) => {
      session.apply((state) => configureIntakeRequirement(state, modality, term, value.required));
    },
  );
  const identity = `intake-${modality}-${term}`;
  return (
    <form onSubmit={submit} data-intake-requirement={`${modality}:${term}`}>
      <fieldset disabled={readOnly}>
        <legend>{offerLabel(offer)}</legend>
        {current?.status && current.status !== 'unknown' && (
          <p className="help">
            Ingresso informado: {current.status === 'yes' ? 'há ingresso' : 'não há ingresso'}.
          </p>
        )}
        <form.Field name="required">
          {(field) => (
            <Check
              field={field}
              id={`${identity}-required`}
              label="Exigir esta atividade no calendário"
            />
          )}
        </form.Field>
        <button type="submit">Salvar exigência</button>
        <FormFeedback error={error} />
      </fieldset>
    </form>
  );
}

export default function IntakeRequirementForm({ item }: { item: ActivityRequirement }) {
  const { state } = useCalendarEditor();
  const policy = policyFor(state.year);
  if (!policy.intakeRequirements || !item.intake || !item.term) return null;
  const term = item.term;
  return (
    <details className="activity-detail">
      <summary>Exigência por regra local</summary>
      <p className="help">
        O cadastro de datas é permitido sem configurar ingresso. Exija esta atividade somente quando
        houver regra local. Isso não altera as obrigações de veteranos.
      </p>
      {state.offers
        .filter(
          (offer) =>
            !policy.excludes(offer) &&
            offer.scope?.status !== 'own-regulation' &&
            (!item.modalities || item.modalities.includes(offer.kind)) &&
            (!item.offerIds || item.offerIds.includes(offer.id)) &&
            (!item.offerId || item.offerId === offer.id) &&
            termsFor(state, offer.id).includes(term),
        )
        .map((offer) => (
          <OfferRequirement key={`${offer.id}:${term}`} offer={offer} term={term} />
        ))}
    </details>
  );
}
