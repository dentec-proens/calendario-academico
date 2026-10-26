import VacationsForm from '../forms/VacationsForm.tsx';

export default function VacationsSection() {
  return (
    <section id="vacations" className="view">
      <div className="panel">
        <h3>Períodos de férias docentes</h3>
        <p className="help">Informe até três períodos de férias e a fonte da decisão do campus.</p>
        <VacationsForm />
      </div>
    </section>
  );
}
