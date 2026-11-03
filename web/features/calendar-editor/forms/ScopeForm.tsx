import { useState } from 'react';
import { policyFor } from '#src/domain/policies/registry.ts';
import type { CalendarOffer } from '#src/domain/calendar/model.ts';
import { offerLabel } from '#src/domain/calendar/offers.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarForm } from './useCalendarForm.ts';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';
import { ChoiceGroup } from '../../../components/ui/ChoiceGroup.tsx';
import { Button } from '../../../components/ui/Button.tsx';
import { Notice } from '../../../components/ui/Notice.tsx';

type ScopeStatus = 'covered' | 'own-regulation';

function OfferScopeForm({
  offer,
  norm,
  onDone,
}: {
  offer: CalendarOffer;
  norm: string;
  onDone?: () => void;
}) {
  const { session, readOnly } = useCalendarEditor();
  const defaults: { status: '' | ScopeStatus } = { status: offer.scope?.status ?? '' };
  const { form, submit, error } = useCalendarForm(`scope:${offer.id}`, defaults, (value) => {
    if (!value.status) throw new Error('Confirme a norma aplicável a esta oferta.');
    const status = value.status;
    session.apply((current) => ({
      ...current,
      offers: current.offers.map((item) =>
        item.id === offer.id ? { ...item, scope: { status } } : item,
      ),
    }));
    onDone?.();
    requestAnimationFrame(() => document.getElementById(`scope-${offer.id}-summary`)?.focus());
  });
  return (
    <form id={`scope-form-${offer.id}`} className="scope-form" onSubmit={submit}>
      <fieldset disabled={readOnly}>
        <form.Field name="status">
          {(field) => (
            <ChoiceGroup<ScopeStatus>
              id={`calendar-scope-${offer.id}`}
              label={offerLabel(offer)}
              value={field.state.value || null}
              options={[
                { value: 'covered', label: `Abrangida pela ${norm}` },
                {
                  value: 'own-regulation',
                  label: 'Norma própria (EaD, qualificação, pós ou outro caso)',
                },
              ]}
              onValueChange={(value) => field.handleChange(value)}
            />
          )}
        </form.Field>
        <div className="scope-form__actions">
          <Button type="submit">Confirmar norma</Button>
          {onDone && (
            <Button variant="secondary" onClick={onDone}>
              Cancelar
            </Button>
          )}
        </div>
        <FormFeedback error={error} />
      </fieldset>
    </form>
  );
}

/** A confirmed offer is one line; changing it reopens the same form. */
function ConfirmedScope({ offer, norm }: { offer: CalendarOffer; norm: string }) {
  const { readOnly } = useCalendarEditor();
  const [changing, setChanging] = useState(false);
  if (changing)
    return <OfferScopeForm offer={offer} norm={norm} onDone={() => setChanging(false)} />;
  return (
    <p className="scope-summary" data-offer-scope={offer.id}>
      <span id={`scope-${offer.id}-summary`} tabIndex={-1}>
        <strong>{offerLabel(offer)}:</strong>{' '}
        {offer.scope?.status === 'covered' ? `abrangida pela ${norm}` : 'norma própria'}
      </span>
      {!readOnly && (
        <button type="button" className="link-button" onClick={() => setChanging(true)}>
          Alterar
        </button>
      )}
    </p>
  );
}

/** Each offer has its own human confirmation, independently of teaching dates and delivery mode. */
export default function ScopeForm() {
  const { state, formEpoch } = useCalendarEditor();
  const policy = policyFor(state.year);
  const scope = policy.scope;
  if (!scope) return null;
  const offers = state.offers.filter((offer) => !policy.excludes(offer));
  const pending = offers.filter((offer) => !offer.scope);
  const excluded = state.offers.filter((offer) => policy.excludes(offer));
  const explanation = (
    <p>
      A referência de {state.year} é a {scope.norm}. O tipo e o modo de oferta, sozinhos, não
      confirmam essa aplicação; ofertas com norma própria ficam sem conclusão automática.
    </p>
  );
  return (
    <section id="review-scope" className="review-scope" aria-labelledby="review-scope-title">
      {pending.length ? (
        <Notice
          tone="warning"
          title="Confirme a norma aplicável"
          titleAs="h3"
          titleProps={{ id: 'review-scope-title' }}
        >
          {explanation}
          {pending.map((offer) => (
            <OfferScopeForm key={`${offer.id}:${formEpoch}`} offer={offer} norm={scope.norm} />
          ))}
        </Notice>
      ) : (
        <h3 id="review-scope-title" className="review-heading">
          Norma aplicável
        </h3>
      )}
      {offers
        .filter((offer) => offer.scope)
        .map((offer) => (
          <ConfirmedScope key={`${offer.id}:${formEpoch}`} offer={offer} norm={scope.norm} />
        ))}
      {excluded.map((offer) => (
        <p className="scope-summary" key={offer.id}>
          <span>
            <strong>{offerLabel(offer)}:</strong> depende de norma própria.
          </span>
        </p>
      ))}
    </section>
  );
}
