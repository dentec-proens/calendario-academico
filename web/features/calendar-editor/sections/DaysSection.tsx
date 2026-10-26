import SaturdaysForm from '../forms/SaturdaysForm.tsx';
import VacationsForm from '../forms/VacationsForm.tsx';

export default function DaysSection() {
  return (
    <section id="days" className="view">
      <div className="panel">
        <h3>Sábados letivos por mês</h3>
        <p className="help">
          Selecione os sábados definidos pelo campus. Datas em feriados ou recessos serão
          sinalizadas como conflito.
        </p>
        <SaturdaysForm />
      </div>
      <div className="panel">
        <h2>Férias docentes</h2>
        <p>Informe até três períodos de férias e a fonte da decisão do campus.</p>
        <VacationsForm />
      </div>
    </section>
  );
}
