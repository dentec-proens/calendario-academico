import type { Bootstrap } from '../../shared/convex/types.ts';
import './calendar-list.css';

export default function CampusFilter({
  campuses,
  value,
  onChange,
}: {
  campuses: Bootstrap['campuses'];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <label id="filter-label">
      Filtrar por campus
      <select id="campus-filter" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Todos os campi</option>
        {campuses.map((campus) => (
          <option key={campus.id} value={campus.id}>
            {campus.name}
          </option>
        ))}
      </select>
    </label>
  );
}
