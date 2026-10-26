import PeriodForm from '../forms/PeriodForm.tsx';
import IntakeForm from '../forms/IntakeForm.tsx';
import OrganizationForm from '../forms/OrganizationForm.tsx';

export default function PeriodsSection() {
  return (
    <section id="periods" className="view">
      <div className="panel">
        <h3>Períodos letivos</h3>
        <p className="help">
          Cadastre os intervalos de aulas do ano e associe cada um às ofertas e ao ciclo
          correspondente. Os períodos não podem se sobrepor dentro da mesma oferta. As etapas de
          avaliação são organizadas no próximo passo.
        </p>
        <OrganizationForm />
        <PeriodForm />
        <IntakeForm />
      </div>
    </section>
  );
}
