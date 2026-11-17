import { KindNote } from '../OfferName.tsx';

export interface SaturdayOfferChoiceItem {
  id: string;
  label: string;
  checked: boolean;
  /** An offer that cannot be chosen stays listed, so the reason is in view. */
  disabled: boolean;
  /** The offer kind, when the offer name alone does not say it. */
  kind?: string;
  /** What the choice leaves out, part of the checkbox name so it is read with it. */
  note?: string;
}

/** Which offers a Saturday reaches. Calendars with one offer have nothing to choose: no control. */
export default function SaturdayOfferChoice({
  id,
  form,
  items,
  onToggle,
}: {
  id: string;
  /** The form the checkboxes belong to, when the panel sits outside of it. */
  form?: string;
  items: SaturdayOfferChoiceItem[];
  onToggle: (offerId: string, checked: boolean) => void;
}) {
  if (items.length < 2) return null;
  return (
    <fieldset id={id} className="saturday-offers">
      <legend>Vale para</legend>
      {items.map((item) => (
        <label className="check" key={item.id} data-saturday-offer={item.id}>
          <input
            type="checkbox"
            name={`${id}-offer`}
            value={item.id}
            form={form}
            checked={item.checked}
            disabled={item.disabled}
            onChange={(event) => onToggle(item.id, event.target.checked)}
          />
          <span>
            {item.label}
            <KindNote kind={item.kind} />
            {item.note && <small>{item.note}</small>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
