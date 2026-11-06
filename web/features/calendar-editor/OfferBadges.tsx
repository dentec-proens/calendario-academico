/** The offers of a row, as badges; the caller passes none when the calendar has a single offer. */
export default function OfferBadges({ offers }: { offers: readonly string[] }) {
  if (!offers.length) return null;
  return (
    <span className="offer-badges" data-offer-badges>
      <span className="visually-hidden">{offers.length === 1 ? 'Oferta: ' : 'Ofertas: '}</span>
      {offers.map((offer, index) => (
        <span key={offer} className="offer-badge ui-status ui-status--neutral" data-offer-badge>
          {offer}
          {index < offers.length - 1 && <span className="visually-hidden">, </span>}
        </span>
      ))}
    </span>
  );
}
