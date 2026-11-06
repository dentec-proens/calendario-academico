import { ChoiceGroup } from '../../components/ui/ChoiceGroup.tsx';
import { modalityLabels, selectableModalities } from '#src/domain/calendar/modalities.ts';
import { organizationLabels, type Modality } from '#src/domain/calendar/config.ts';

type Organization = 'anual' | 'semestral';
export interface CreationOffer {
  kind: Modality;
  organization: Organization;
}

const organizationOptions = (['anual', 'semestral'] as const).map((value) => ({
  value,
  label: organizationLabels[value],
}));

export const offersSummary = (offers: readonly CreationOffer[]) =>
  offers
    .map(
      (offer) =>
        `${modalityLabels[offer.kind]} (${organizationLabels[offer.organization].toLowerCase()})`,
    )
    .join(' + ');

/** One offer per kind, each with its organization; the rest is adjusted in the editor. */
export default function OfferChoices({
  offers,
  onChange,
}: {
  offers: readonly CreationOffer[];
  onChange: (offers: CreationOffer[]) => void;
}) {
  const offerFor = (kind: Modality) => offers.find((offer) => offer.kind === kind);
  // Offers follow the catalogue order, whatever the order in which they were marked.
  const setOffer = (kind: Modality, organization: Organization | null) =>
    onChange(
      selectableModalities.flatMap((item): CreationOffer[] => {
        const current = item === kind ? organization : offerFor(item)?.organization;
        return current ? [{ kind: item, organization: current }] : [];
      }),
    );
  return (
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
        Duas ofertas do mesmo tipo, cursos, turmas e modo de oferta são ajustados depois, no editor.
      </p>
    </fieldset>
  );
}
