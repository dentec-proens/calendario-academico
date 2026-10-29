import { policyFor } from '#src/domain/policies/registry.ts';
import type { CalendarOffer } from '#src/domain/calendar/model.ts';
import { offerLabel } from '#src/domain/calendar/offers.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarForm } from './useCalendarForm.ts';
import { Select } from './fields.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';

function OfferScopeForm({ offer, norm }: { offer: CalendarOffer; norm: string }) {
  const { session, readOnly } = useCalendarEditor();
  const defaults: { status: '' | 'covered' | 'own-regulation' } = {
    status: offer.scope?.status ?? '',
  };
  const summaryId = `scope-${offer.id}-summary`;
  const { form, submit, error } = useCalendarForm(`scope:${offer.id}`, defaults, (value) => {
    if (!value.status) throw new Error('Confirme a norma aplicável a esta oferta.');
    const status = value.status;
    session.apply((current) => ({
      ...current,
      offers: current.offers.map((item) =>
        item.id === offer.id ? { ...item, scope: { status } } : item,
      ),
    }));
    requestAnimationFrame(() => document.getElementById(summaryId)?.focus());
  });
  return (
    <details open={!offer.scope} data-offer-scope={offer.id}>
      <summary id={summaryId}>
        {offerLabel(offer)} —{' '}
        {offer.scope ? 'Conferir norma aplicável' : 'Confirmar norma aplicável'}
      </summary>
      <form id={`scope-form-${offer.id}`} onSubmit={submit}>
        <fieldset disabled={readOnly}>
          <form.Field name="status">
            {(field) => (
              <Select
                field={field}
                id={`calendar-scope-${offer.id}`}
                label={`Norma aplicável — ${offerLabel(offer)}`}
                required
              >
                <option value="">Selecione</option>
                <option value="covered">{`${norm} — técnico ou graduação abrangido`}</option>
                <option value="own-regulation">
                  Norma própria — EaD, qualificação, pós ou outro caso
                </option>
              </Select>
            )}
          </form.Field>
          <p className="help">
            Ofertas com norma própria permanecem sem conclusão automática pela {norm}.
          </p>
          <button type="submit">Confirmar norma de {offerLabel(offer)}</button>
          <FormFeedback error={error} />
        </fieldset>
      </form>
    </details>
  );
}

/** Each offer has its own human confirmation, independently of teaching dates and delivery mode. */
export default function ScopeForm() {
  const { state, formEpoch } = useCalendarEditor();
  const policy = policyFor(state.year);
  const scope = policy.scope;
  if (!scope) return null;
  return (
    <div className="panel">
      <h3>Norma aplicável às ofertas</h3>
      <p className="help">
        A referência institucional de {state.year} é a {scope.norm}. Confirme quais ofertas são
        abrangidas. O tipo e o modo de oferta, sozinhos, não confirmam essa aplicação.
      </p>
      {state.offers.map((offer) =>
        policy.excludes(offer) ? (
          <p className="help" key={offer.id}>
            {offerLabel(offer)}: depende de norma própria.
          </p>
        ) : (
          <OfferScopeForm key={`${offer.id}:${formEpoch}`} offer={offer} norm={scope.norm} />
        ),
      )}
    </div>
  );
}
