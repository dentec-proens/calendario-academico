import PeriodForm from '../forms/PeriodForm.tsx';
import AssessmentSettingsForm from '../forms/AssessmentSettingsForm.tsx';
import ActivityChecklist from '../events/ActivityChecklist.tsx';

export default function PeriodsSection() {
  return (
    <section id="periods" className="view">
      <div className="panel">
        <h3>Períodos letivos</h3>
        <p className="help">
          Os períodos letivos não podem se sobrepor. As etapas de avaliação são definidas por oferta
          e podem ocorrer simultaneamente entre ofertas.
        </p>
        <PeriodForm />
        <section id="assessment-area">
          <h3>Etapas de avaliação</h3>
          <AssessmentSettingsForm />
          <p className="help">
            Defina as etapas por oferta. O início da primeira etapa permite sugerir os demais
            intervalos.
          </p>
          <ActivityChecklist stages />
        </section>
      </div>
    </section>
  );
}
