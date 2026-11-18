import type { Bootstrap } from '../../shared/convex/types.ts';
import './calendar-list.css';

/**
 * Narrows the list to one campus. Whoever works on every campus starts with all of them; a campus
 * account starts with its own (the empty value) and may look at the calendars of another.
 */
export default function CampusFilter({
  campuses,
  ownCampusId,
  value,
  onChange,
}: {
  campuses: Bootstrap['campuses'];
  ownCampusId?: string | null;
  value: string;
  onChange: (id: string) => void;
}) {
  // A campus account never lists every campus at once, even when its own is archived.
  const ownMode = ownCampusId !== undefined;
  const own = campuses.find((campus) => campus.id === ownCampusId);
  return (
    <label id="filter-label">
      {ownMode ? 'Campus' : 'Filtrar por campus'}
      <select
        id="campus-filter"
        value={own && value === own.id ? '' : value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">
          {!ownMode ? 'Todos os campi' : own ? `${own.name} (seu campus)` : 'Seu campus'}
        </option>
        {campuses
          .filter((campus) => campus !== own)
          .map((campus) => (
            <option key={campus.id} value={campus.id}>
              {campus.name}
            </option>
          ))}
      </select>
    </label>
  );
}
