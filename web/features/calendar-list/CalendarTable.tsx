import { Fragment, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import './calendar-list.css';

export interface CalendarColumn<T> {
  label: string;
  /** A grid track, such as `13rem`; the first column usually takes the remaining width. */
  width: string;
  /** Renders the cell itself, which becomes a direct child of the row grid. */
  render: (item: T) => ReactNode;
}

/**
 * The shared calendar table: each screen brings its columns and actions. The column names are
 * visual only, so every cell whose content does not name itself carries its own hidden label.
 */
export default function CalendarTable<T extends { id: string }>({
  id,
  items,
  columns,
  rowProps,
  empty,
}: {
  id: string;
  items: readonly T[];
  columns: readonly CalendarColumn<T>[];
  rowProps?: (item: T) => HTMLAttributes<HTMLLIElement> & Record<`data-${string}`, string>;
  empty?: ReactNode;
}) {
  const style = {
    '--calendar-columns': columns.map((column) => column.width).join(' '),
  } as CSSProperties;
  return (
    <div className="calendar-list" data-view="table" style={style}>
      {items.length ? (
        <div className="calendar-list-heading" aria-hidden="true">
          {columns.map((column) => (
            <span key={column.label}>{column.label}</span>
          ))}
        </div>
      ) : null}
      <ul id={id} className="calendar-list-items">
        {items.map((item) => (
          <li key={item.id} className="calendar-list-row" {...rowProps?.(item)}>
            {columns.map((column) => (
              <Fragment key={column.label}>{column.render(item)}</Fragment>
            ))}
          </li>
        ))}
        {!items.length && empty ? <li className="calendar-list-empty">{empty}</li> : null}
      </ul>
    </div>
  );
}
