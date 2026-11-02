import ActivityChecklist from '../events/ActivityChecklist.tsx';
import ActivityFilters from '../events/ActivityFilters.tsx';

export default function EventsSection() {
  return (
    <section id="events" className="view">
      <div className="panel">
        <ActivityFilters />
        <ActivityChecklist />
      </div>
    </section>
  );
}
