import PeriodForm from '../forms/PeriodForm.tsx';
import AssessmentsSection from './AssessmentsSection.tsx';

export default function PeriodsSection() {
  return (
    <section id="periods" className="view">
      <section className="panel period-section-card" aria-labelledby="periods-heading">
        <h3 id="periods-heading">Períodos letivos</h3>
        <p className="help">
          Cadastre os intervalos de aulas do ano e associe cada um às ofertas e ao ciclo
          correspondente. Os períodos não podem se sobrepor dentro da mesma oferta.
        </p>
        <PeriodForm />
      </section>
      <AssessmentsSection />
    </section>
  );
}
