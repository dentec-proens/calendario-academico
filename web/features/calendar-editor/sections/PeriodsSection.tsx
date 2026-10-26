import PeriodForm from '../forms/PeriodForm.tsx';
import IntakeForm from '../forms/IntakeForm.tsx';

export default function PeriodsSection() {
  return (
    <section id="periods" className="view">
      <div className="panel">
        <h3>Períodos letivos</h3>
        <p className="help">
          Cadastre os intervalos de aulas do ano. Os períodos letivos não podem se sobrepor. As
          etapas de avaliação são organizadas no próximo passo.
        </p>
        <PeriodForm />
        <IntakeForm />
      </div>
    </section>
  );
}
