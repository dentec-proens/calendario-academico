import type { CSSProperties } from 'react';
import { categories, eventCategory } from '#src/domain/calendar/activities/categories.ts';

type Props = {
  event: Parameters<typeof eventCategory>[0];
  /** Shows the category name beside the swatch; otherwise it is read only by screen readers. */
  withLabel?: boolean;
};

/** The color of the printed legend for a date's category, always with its name. */
export function CategoryMark({ event, withLabel = false }: Props) {
  const [key, label, color] = categories.find(([key]) => key === eventCategory(event))!;
  return (
    <span className="category-mark" data-category={key} title={withLabel ? undefined : label}>
      {color && (
        <span
          className="category-mark__swatch"
          style={{ '--category-color': color } as CSSProperties}
          aria-hidden="true"
        />
      )}
      <span className={withLabel ? undefined : 'visually-hidden'}>{label}</span>
    </span>
  );
}
